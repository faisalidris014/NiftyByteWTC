import {
  ErrorHandler,
  TimeoutManager,
  CircuitBreakerManager,
  RetryManager,
  FallbackManager,
  ErrorReporter,
  ResourceCleaner,
  ErrorHooks,
  ResilienceManager,
  createErrorHandler,
  createDefaultTimeoutManager,
  createDefaultCircuitBreakerManager,
  createDefaultRetryManager,
  createDefaultFallbackManager,
  createDefaultErrorReporter,
  createDefaultResourceCleaner,
  createDefaultErrorHooks,
  createResilienceManagerWithDefaults,
  DEFAULT_RESILIENCE_OPTIONS
} from './index';

/**
 * Comprehensive examples demonstrating the timeout and error handling system
 */

export class ResilienceExamples {

  /**
   * Example 1: Basic timeout management
   */
  static async demonstrateTimeoutManagement(): Promise<void> {
    console.log('=== Timeout Management Example ===');

    const timeoutManager = createDefaultTimeoutManager();

    // Example: Execute with timeout
    try {
      const result = await timeoutManager.withTimeout(
        'execution',
        async () => {
          // Simulate long-running operation
          await new Promise(resolve => setTimeout(resolve, 2000));
          return 'Operation completed successfully';
        },
        1000, // 1 second timeout
        { operation: 'demo' },
        () => 'Fallback value due to timeout'
      );

      console.log('Result:', result);
    } catch (error) {
      console.error('Timeout error:', error.message);
    }
  }

  /**
   * Example 2: Circuit breaker pattern
   */
  static async demonstrateCircuitBreaker(): Promise<void> {
    console.log('\n=== Circuit Breaker Example ===');

    const circuitManager = createDefaultCircuitBreakerManager();
    const errorHandler = createErrorHandler();

    let failureCount = 0;

    // Simulate unreliable service
    const unreliableOperation = async (): Promise<string> => {
      failureCount++;
      if (failureCount <= 3) {
        throw new Error('Service temporarily unavailable');
      }
      return 'Service response';
    };

    try {
      const result = await circuitManager.execute('unreliable-service', unreliableOperation);
      console.log('Circuit breaker result:', result);
    } catch (error) {
      console.error('Circuit breaker error:', error.message);

      // Check circuit state
      const circuit = circuitManager.getCircuitByName('unreliable-service');
      console.log('Circuit state:', circuit?.getState());
      console.log('Failure count:', circuit?.getFailureCount());
    }
  }

  /**
   * Example 3: Retry with exponential backoff
   */
  static async demonstrateRetryMechanism(): Promise<void> {
    console.log('\n=== Retry Mechanism Example ===');

    const errorHandler = createErrorHandler();
    const retryManager = createDefaultRetryManager(errorHandler);

    let attempt = 0;

    const flakyOperation = async (): Promise<string> => {
      attempt++;
      console.log(`Attempt ${attempt}`);

      if (attempt < 3) {
        throw new Error(`Temporary failure on attempt ${attempt}`);
      }

      return 'Operation succeeded after retries';
    };

    try {
      const result = await retryManager.executeWithRetry(
        flakyOperation,
        'flaky-operation',
        {
          maxAttempts: 5,
          initialDelayMs: 500,
          backoffFactor: 2,
          jitter: true
        }
      );

      console.log('Final result:', result);
    } catch (error) {
      console.error('All retries failed:', error.message);
    }
  }

  /**
   * Example 4: Fallback strategies
   */
  static async demonstrateFallbackStrategies(): Promise<void> {
    console.log('\n=== Fallback Strategies Example ===');

    const errorHandler = createErrorHandler();
    const fallbackManager = createDefaultFallbackManager(errorHandler);

    // Cache a value for fallback
    fallbackManager.cacheValue('user-data', { name: 'John Doe', id: 123 }, 30000);

    const failingOperation = async (): Promise<any> => {
      throw new Error('Primary service unavailable');
    };

    try {
      const result = await fallbackManager.executeWithFallback(
        failingOperation,
        {
          strategy: 'cachedResult',
          cacheKey: 'user-data'
        },
        'user-data-operation'
      );

      console.log('Fallback result:', result);
    } catch (error) {
      console.error('Fallback also failed:', error.message);
    }
  }

  /**
   * Example 5: Comprehensive resilience manager
   */
  static async demonstrateResilienceManager(): Promise<void> {
    console.log('\n=== Comprehensive Resilience Manager Example ===');

    const errorHandler = createErrorHandler();
    const resilienceManager = createResilienceManagerWithDefaults(errorHandler);

    const operation = async (): Promise<string> => {
      // Simulate various failure scenarios
      const random = Math.random();

      if (random < 0.3) {
        throw new Error('Network timeout');
      } else if (random < 0.6) {
        throw new Error('Service unavailable');
      }

      return 'Operation successful';
    };

    for (let i = 0; i < 5; i++) {
      try {
        const result = await resilienceManager.executeWithResilience(
          operation,
          {
            operationName: 'demo-operation',
            circuitName: 'demo-circuit',
            timeoutLevel: 'execution',
            retryStrategy: {
              maxAttempts: 2,
              initialDelayMs: 1000
            },
            fallbackStrategy: {
              strategy: 'defaultValue',
              defaultValue: 'Fallback response'
            },
            resourceTracking: true
          }
        );

        console.log(`Execution ${i + 1}:`, result);
      } catch (error) {
        console.error(`Execution ${i + 1} failed:`, error.message);
      }
    }

    // Show statistics
    const stats = resilienceManager.getResilienceStatistics();
    console.log('\nResilience Statistics:');
    console.log('Total timeouts:', stats.timeouts.totalTimeouts);
    console.log('Circuit state:', stats.circuitBreakers);
    console.log('Retry success rate:', stats.retries.successfulRetries);
  }

  /**
   * Example 6: Error reporting and diagnostics
   */
  static async demonstrateErrorReporting(): Promise<void> {
    console.log('\n=== Error Reporting Example ===');

    const errorHandler = createErrorHandler();
    const errorReporter = createDefaultErrorReporter(errorHandler);

    // Generate some errors
    try {
      throw new Error('Simulated error for reporting');
    } catch (error) {
      const errorEvent = errorHandler.handleError(
        error as Error,
        'DEMO_ERROR',
        {
          timestamp: Date.now(),
          additionalData: {
            userId: 123,
            feature: 'demo'
          }
        },
        'error',
        true
      );

      console.log('Error event created:', errorEvent.id);
    }

    // Show reports
    const reports = errorReporter.getRecentTimeoutEvents(5);
    console.log('Recent reports:', reports.length);
  }

  /**
   * Example 7: Resource cleanup
   */
  static async demonstrateResourceCleanup(): Promise<void> {
    console.log('\n=== Resource Cleanup Example ===');

    const resourceCleaner = createDefaultResourceCleaner();

    // Track some resources
    const fileResource = resourceCleaner.trackFile(
      '/tmp/demo-file.txt',
      'Temporary demo file'
    );

    const timerResource = resourceCleaner.trackTimer(
      setTimeout(() => {}, 10000),
      'Demo timeout timer'
    );

    console.log('Tracked resources:', resourceCleaner.getTrackedResources().length);

    // Cleanup specific resource
    await resourceCleaner.cleanupResource(fileResource);
    console.log('Resources after cleanup:', resourceCleaner.getTrackedResources().length);

    // Show cleanup statistics
    const stats = resourceCleaner.getCleanupStatistics();
    console.log('Cleanup statistics:', stats);
  }

  /**
   * Example 8: Custom error hooks
   */
  static async demonstrateErrorHooks(): Promise<void> {
    console.log('\n=== Error Hooks Example ===');

    const errorHooks = createDefaultErrorHooks();
    const errorHandler = createErrorHandler();

    // Register a beforeError hook
    errorHooks.registerHook(
      'beforeError',
      (error, context) => {
        console.log('Before error hook:', error.message);
        context.additionalData = context.additionalData || {};
        context.additionalData.hookProcessed = true;
      },
      {
        priority: 'high',
        description: 'Log errors before handling'
      }
    );

    // Register an errorTransform hook
    errorHooks.registerHook(
      'errorTransform',
      (error) => {
        // Add additional context to errors
        return new Error(`Enhanced: ${error.message} (processed by hook)`);
      },
      {
        priority: 'normal',
        description: 'Enhance error messages'
      }
    );

    // Test the hooks
    try {
      throw new Error('Original error message');
    } catch (error) {
      const transformedError = await errorHooks.executeErrorTransformHooks(
        error as Error,
        { timestamp: Date.now() }
      );

      console.log('Transformed error:', transformedError.message);
    }
  }

  /**
   * Run all examples
   */
  static async runAllExamples(): Promise<void> {
    console.log('Starting resilience system examples...\n');

    await this.demonstrateTimeoutManagement();
    await this.demonstrateCircuitBreaker();
    await this.demonstrateRetryMechanism();
    await this.demonstrateFallbackStrategies();
    await this.demonstrateResilienceManager();
    await this.demonstrateErrorReporting();
    await this.demonstrateResourceCleanup();
    await this.demonstrateErrorHooks();

    console.log('\n=== All examples completed ===');
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  ResilienceExamples.runAllExamples().catch(console.error);
}