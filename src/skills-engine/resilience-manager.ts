import { EventEmitter } from 'events';
import { ErrorHandler, ErrorEvent, ErrorContext } from './error-handler';
import { TimeoutManager, TimeoutManagerOptions } from './timeout-manager';
import { CircuitBreakerManager, CircuitBreakerOptions } from './circuit-breaker';
import { RetryManager, RetryStrategy } from './retry-manager';
import { FallbackManager, FallbackOptions } from './fallback-manager';
import { ErrorReporter, ErrorReporterOptions } from './error-reporter';
import { ResourceCleaner, ResourceCleanerOptions } from './resource-cleaner';
import { ErrorHooks, ErrorHooksOptions } from './error-hooks';

// Resilience manager configuration
export interface ResilienceManagerOptions {
  // Component configurations
  timeoutOptions?: Partial<TimeoutManagerOptions>;
  circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
  retryOptions?: Partial<RetryStrategy>;
  fallbackOptions?: Partial<FallbackOptions>;
  reporterOptions?: Partial<ErrorReporterOptions>;
  cleanerOptions?: Partial<ResourceCleanerOptions>;
  hooksOptions?: Partial<ErrorHooksOptions>;

  // Global settings
  enabled: boolean;
  enableMonitoring: boolean;
  enableReporting: boolean;
  enableCleanup: boolean;
  enableHooks: boolean;
}

// Default resilience manager configuration
const DEFAULT_RESILIENCE_OPTIONS: ResilienceManagerOptions = {
  enabled: true,
  enableMonitoring: true,
  enableReporting: true,
  enableCleanup: true,
  enableHooks: true,
};

// Operation execution context
interface ExecutionContext {
  operationName: string;
  circuitName?: string;
  timeoutLevel?: string;
  retryStrategy?: Partial<RetryStrategy>;
  fallbackStrategy?: Partial<FallbackOptions>;
  resourceTracking?: boolean;
  customContext?: Record<string, any>;
}

/**
 * Comprehensive resilience manager that integrates all error handling components
 */
export class ResilienceManager extends EventEmitter {
  private errorHandler: ErrorHandler;
  private timeoutManager: TimeoutManager;
  private circuitBreakerManager: CircuitBreakerManager;
  private retryManager: RetryManager;
  private fallbackManager: FallbackManager;
  private errorReporter: ErrorReporter;
  private resourceCleaner: ResourceCleaner;
  private errorHooks: ErrorHooks;

  private options: ResilienceManagerOptions;

  constructor(
    errorHandler: ErrorHandler,
    options: Partial<ResilienceManagerOptions> = {}
  ) {
    super();
    this.options = { ...DEFAULT_RESILIENCE_OPTIONS, ...options };
    this.errorHandler = errorHandler;

    // Initialize all components
    this.initializeComponents();
    this.setupEventForwarding();
  }

  /**
   * Initialize all resilience components
   */
  private initializeComponents(): void {
    // Timeout manager
    this.timeoutManager = new TimeoutManager({
      ...this.options.timeoutOptions,
      errorHandler: this.errorHandler,
    });

    // Circuit breaker manager
    this.circuitBreakerManager = new CircuitBreakerManager();

    // Retry manager
    this.retryManager = new RetryManager(this.errorHandler, this.options.retryOptions);

    // Fallback manager
    this.fallbackManager = new FallbackManager(this.errorHandler, this.options.fallbackOptions);

    // Error reporter
    this.errorReporter = new ErrorReporter(this.errorHandler, this.options.reporterOptions);

    // Resource cleaner
    this.resourceCleaner = new ResourceCleaner({
      ...this.options.cleanerOptions,
      errorHandler: this.errorHandler,
    });

    // Error hooks
    this.errorHooks = new ErrorHooks({
      ...this.options.hooksOptions,
      errorHandler: this.errorHandler,
    });
  }

  /**
   * Setup event forwarding between components
   */
  private setupEventForwarding(): void {
    // Forward error events from error handler
    this.errorHandler.on('error', (errorEvent: ErrorEvent) => {
      this.emit('error', errorEvent);
    });

    // Forward timeout events
    this.timeoutManager.on('timeout', (event) => {
      this.emit('timeout', event);
    });

    // Forward circuit breaker events
    this.circuitBreakerManager.on('circuitStateChange', (event) => {
      this.emit('circuitStateChange', event);
    });

    // Forward retry events
    this.retryManager.on('retryAttempt', (event) => {
      this.emit('retryAttempt', event);
    });

    // Forward fallback events
    this.fallbackManager.on('fallbackSuccess', (event) => {
      this.emit('fallbackSuccess', event);
    });

    // Forward cleanup events
    this.resourceCleaner.on('resourceCleaned', (event) => {
      this.emit('resourceCleaned', event);
    });

    // Forward hook events
    this.errorHooks.on('hookSuccess', (event) => {
      this.emit('hookSuccess', event);
    });
  }

  /**
   * Execute operation with full resilience protection
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    context: ExecutionContext
  ): Promise<T> {
    if (!this.options.enabled) {
      return operation();
    }

    const executionId = this.generateExecutionId(context.operationName);
    const startTime = Date.now();

    try {
      // Execute beforeError hooks
      if (this.options.enableHooks) {
        await this.errorHooks.executeBeforeErrorHooks(
          new Error('Pre-execution hook'),
          this.createErrorContext(context)
        );
      }

      // Track resources if enabled
      if (context.resourceTracking && this.options.enableCleanup) {
        this.trackOperationResources(executionId, context);
      }

      // Execute with circuit breaker protection
      let result: T;
      if (context.circuitName) {
        result = await this.circuitBreakerManager.execute(
          context.circuitName,
          () => this.executeWithRetryAndTimeout(operation, context),
          this.options.circuitBreakerOptions
        );
      } else {
        result = await this.executeWithRetryAndTimeout(operation, context);
      }

      const executionTime = Date.now() - startTime;

      // Record successful execution
      this.emit('executionSuccess', {
        executionId,
        operationName: context.operationName,
        executionTimeMs: executionTime,
        timestamp: Date.now(),
      });

      return result;

    } catch (error) {
      const executionError = error as Error;
      const executionTime = Date.now() - startTime;

      // Execute error transform hooks
      let transformedError = executionError;
      if (this.options.enableHooks) {
        transformedError = await this.errorHooks.executeErrorTransformHooks(
          executionError,
          this.createErrorContext(context)
        );
      }

      // Execute error filter hooks
      let shouldProcess = true;
      if (this.options.enableHooks) {
        shouldProcess = await this.errorHooks.executeErrorFilterHooks(
          transformedError,
          this.createErrorContext(context)
        );
      }

      if (shouldProcess) {
        // Handle error through error handler
        const errorEvent = this.errorHandler.handleError(
          transformedError,
          'EXECUTION_FAILED',
          this.createErrorContext(context, { executionTimeMs: executionTime }),
          'error',
          false
        );

        // Execute afterError hooks
        if (this.options.enableHooks) {
          await this.errorHooks.executeAfterErrorHooks(errorEvent);
        }

        // Execute fallback strategy if available
        if (context.fallbackStrategy) {
          try {
            return await this.fallbackManager.executeWithFallback(
              () => Promise.reject(transformedError),
              context.fallbackStrategy as FallbackOptions<T>,
              context.operationName,
              context.customContext
            );
          } catch (fallbackError) {
            // If fallback also fails, rethrow the original transformed error
            throw transformedError;
          }
        }
      }

      throw transformedError;
    } finally {
      // Cleanup operation resources
      if (context.resourceTracking && this.options.enableCleanup) {
        await this.cleanupOperationResources(executionId);
      }

      const totalTime = Date.now() - startTime;
      this.emit('executionCompleted', {
        executionId,
        operationName: context.operationName,
        totalTimeMs: totalTime,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Execute operation with retry and timeout protection
   */
  private async executeWithRetryAndTimeout<T>(
    operation: () => Promise<T>,
    context: ExecutionContext
  ): Promise<T> {
    const operationWithTimeout = async (): Promise<T> => {
      if (context.timeoutLevel) {
        return this.timeoutManager.withTimeout(
          context.timeoutLevel,
          operation,
          undefined,
          context.customContext
        );
      }
      return operation();
    };

    if (context.retryStrategy) {
      return this.retryManager.executeWithRetry(
        operationWithTimeout,
        context.operationName,
        context.retryStrategy
      );
    }

    return operationWithTimeout();
  }

  /**
   * Track resources for an operation
   */
  private trackOperationResources(executionId: string, context: ExecutionContext): void {
    // Track the execution itself as a resource
    this.resourceCleaner.trackResource(
      'custom',
      `Operation: ${context.operationName}`,
      async () => {
        // Default cleanup for operation (can be overridden)
        this.emit('operationCleanup', { executionId, context });
      },
      { executionId, ...context },
      5
    );
  }

  /**
   * Cleanup operation resources
   */
  private async cleanupOperationResources(executionId: string): Promise<void> {
    // In a real implementation, you would clean up specific resources
    // associated with this executionId
    this.emit('operationResourcesCleaned', { executionId, timestamp: Date.now() });
  }

  /**
   * Create error context from execution context
   */
  private createErrorContext(
    context: ExecutionContext,
    additionalData?: Record<string, any>
  ): ErrorContext {
    return {
      timestamp: Date.now(),
      additionalData: {
        operationName: context.operationName,
        circuitName: context.circuitName,
        timeoutLevel: context.timeoutLevel,
        ...context.customContext,
        ...additionalData,
      },
    };
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(operationName: string): string {
    return `exec_${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all component managers
   */
  getComponentManagers(): {
    timeoutManager: TimeoutManager;
    circuitBreakerManager: CircuitBreakerManager;
    retryManager: RetryManager;
    fallbackManager: FallbackManager;
    errorReporter: ErrorReporter;
    resourceCleaner: ResourceCleaner;
    errorHooks: ErrorHooks;
  } {
    return {
      timeoutManager: this.timeoutManager,
      circuitBreakerManager: this.circuitBreakerManager,
      retryManager: this.retryManager,
      fallbackManager: this.fallbackManager,
      errorReporter: this.errorReporter,
      resourceCleaner: this.resourceCleaner,
      errorHooks: this.errorHooks,
    };
  }

  /**
   * Get resilience statistics
   */
  getResilienceStatistics(): {
    timeouts: any;
    circuitBreakers: any;
    retries: any;
    fallbacks: any;
    errors: any;
    cleanups: any;
    hooks: any;
  } {
    return {
      timeouts: this.timeoutManager.getTimeoutStatistics(),
      circuitBreakers: this.circuitBreakerManager.getStatistics(),
      retries: this.retryManager.getRetryStatistics(),
      fallbacks: this.fallbackManager.getFallbackStatistics(),
      errors: this.errorReporter.getReportStatistics(),
      cleanups: this.resourceCleaner.getCleanupStatistics(),
      hooks: this.errorHooks.getHookStatistics(),
    };
  }

  /**
   * Set resilience options
   */
  setOptions(options: Partial<ResilienceManagerOptions>): void {
    this.options = { ...this.options, ...options };

    // Update component options if provided
    if (options.timeoutOptions) {
      this.timeoutManager.setOptions(options.timeoutOptions);
    }

    if (options.reporterOptions) {
      this.errorReporter.setOptions(options.reporterOptions);
    }

    if (options.cleanerOptions) {
      this.resourceCleaner.setOptions(options.cleanerOptions);
    }

    if (options.hooksOptions) {
      this.errorHooks.setOptions(options.hooksOptions);
    }
  }

  /**
   * Get current options
   */
  getOptions(): ResilienceManagerOptions {
    return { ...this.options };
  }

  /**
   * Dispose of all resources
   */
  async dispose(): Promise<void> {
    // Dispose all components
    this.timeoutManager.dispose();
    this.circuitBreakerManager.dispose();
    this.retryManager.dispose();
    this.fallbackManager.dispose();
    this.errorReporter.dispose();
    await this.resourceCleaner.dispose();
    this.errorHooks.dispose();

    this.removeAllListeners();
  }

  /**
   * Quick execution with default resilience
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
    circuitName?: string
  ): Promise<T> {
    const context: ExecutionContext = {
      operationName,
      circuitName,
      timeoutLevel: 'execution',
      resourceTracking: true,
    };

    return this.executeWithResilience(operation, context);
  }
}

/**
 * Factory function to create resilience manager
 */
export function createResilienceManager(
  errorHandler: ErrorHandler,
  options?: Partial<ResilienceManagerOptions>
): ResilienceManager {
  return new ResilienceManager(errorHandler, options);
}