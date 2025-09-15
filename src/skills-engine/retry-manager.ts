import { EventEmitter } from 'events';
import { ErrorHandler, ErrorContext } from './error-handler';

// Retry strategy configuration
export interface RetryStrategy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  timeoutMs?: number;
  retryableErrors?: (error: Error) => boolean;
}

// Retry event types
export interface RetryEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error?: Error;
  timestamp: number;
  operation: string;
}

// Default retry configuration
const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Advanced retry manager with exponential backoff and configurable strategies
 */
export class RetryManager extends EventEmitter {
  private retryHistory: RetryEvent[] = [];
  private activeRetries: Map<string, { attempts: number; startTime: number }> = new Map();
  private options: RetryStrategy;

  constructor(
    private errorHandler?: ErrorHandler,
    options: Partial<RetryStrategy> = {}
  ) {
    super();
    this.options = { ...DEFAULT_RETRY_STRATEGY, ...options };
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'unknown',
    customStrategy?: Partial<RetryStrategy>
  ): Promise<T> {
    const strategy = { ...this.options, ...customStrategy };
    const operationId = this.generateOperationId(operationName);

    this.activeRetries.set(operationId, { attempts: 0, startTime: Date.now() });

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, strategy.timeoutMs);

        this.recordRetrySuccess(operationId, operationName, attempt);
        this.activeRetries.delete(operationId);

        return result;
      } catch (error) {
        const shouldRetry = this.shouldRetry(error as Error, attempt, strategy);

        if (!shouldRetry || attempt === strategy.maxAttempts) {
          this.recordRetryFailure(operationId, operationName, attempt, error as Error, false);
          this.activeRetries.delete(operationId);
          throw error;
        }

        const delay = this.calculateDelay(attempt, strategy);
        this.recordRetryAttempt(operationId, operationName, attempt, error as Error, delay, strategy.maxAttempts);

        await this.delay(delay);
      }
    }

    throw new Error('Retry logic failed - should not reach here');
  }

  /**
   * Execute operation with optional timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs) {
      return operation();
    }

    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: Error, attempt: number, strategy: RetryStrategy): boolean {
    // Check if max attempts reached
    if (attempt >= strategy.maxAttempts) {
      return false;
    }

    // Check custom retryable error function
    if (strategy.retryableErrors && !strategy.retryableErrors(error)) {
      return false;
    }

    // Default: retry all errors except specific types
    const nonRetryableErrors = [
      'SyntaxError',
      'TypeError',
      'ReferenceError',
      'RangeError',
      'EvalError',
      'URIError',
    ];

    if (nonRetryableErrors.some(type => error.name === type)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, strategy: RetryStrategy): number {
    const baseDelay = strategy.initialDelayMs * Math.pow(strategy.backoffFactor, attempt - 1);
    const delayWithCap = Math.min(baseDelay, strategy.maxDelayMs);

    if (strategy.jitter) {
      // Add ±20% jitter
      const jitter = delayWithCap * 0.2;
      return delayWithCap - jitter + Math.random() * 2 * jitter;
    }

    return delayWithCap;
  }

  /**
   * Record retry attempt
   */
  private recordRetryAttempt(
    operationId: string,
    operationName: string,
    attempt: number,
    error: Error,
    delayMs: number,
    maxAttempts: number
  ): void {
    const retryInfo = this.activeRetries.get(operationId);
    if (retryInfo) {
      retryInfo.attempts = attempt;
    }

    const retryEvent: RetryEvent = {
      attempt,
      maxAttempts,
      delayMs,
      error,
      timestamp: Date.now(),
      operation: operationName,
    };

    this.retryHistory.push(retryEvent);
    this.emit('retryAttempt', retryEvent);

    // Log retry attempt
    if (this.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          operation: operationName,
          attempt,
          maxAttempts,
          delayMs,
          totalAttempts: attempt,
        },
      };

      this.errorHandler.handleError(
        error,
        'RETRY_ATTEMPT',
        context,
        'warning',
        true
      );
    }
  }

  /**
   * Record retry success
   */
  private recordRetrySuccess(operationId: string, operationName: string, attempt: number): void {
    const retryInfo = this.activeRetries.get(operationId);
    const totalTime = retryInfo ? Date.now() - retryInfo.startTime : 0;

    const successEvent: RetryEvent = {
      attempt,
      maxAttempts: this.options.maxAttempts!,
      delayMs: 0,
      timestamp: Date.now(),
      operation: operationName,
    };

    this.emit('retrySuccess', {
      ...successEvent,
      totalTimeMs: totalTime,
      totalAttempts: attempt,
    });
  }

  /**
   * Record retry failure
   */
  private recordRetryFailure(
    operationId: string,
    operationName: string,
    attempt: number,
    error: Error,
    exceededMaxAttempts: boolean
  ): void {
    const retryInfo = this.activeRetries.get(operationId);
    const totalTime = retryInfo ? Date.now() - retryInfo.startTime : 0;

    const failureEvent: RetryEvent = {
      attempt,
      maxAttempts: this.options.maxAttempts!,
      delayMs: 0,
      error,
      timestamp: Date.now(),
      operation: operationName,
    };

    this.emit('retryFailure', {
      ...failureEvent,
      totalTimeMs: totalTime,
      totalAttempts: attempt,
      exceededMaxAttempts,
    });

    // Log final failure
    if (this.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          operation: operationName,
          totalAttempts: attempt,
          totalTimeMs: totalTime,
          exceededMaxAttempts,
        },
      };

      this.errorHandler.handleError(
        error,
        exceededMaxAttempts ? 'RETRY_MAX_ATTEMPTS' : 'RETRY_FAILURE',
        context,
        'error',
        false
      );
    }
  }

  /**
   * Delay utility with promise
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(operationName: string): string {
    return `retry_${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get retry statistics
   */
  getRetryStatistics(): {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    averageAttempts: number;
    retriesByOperation: Record<string, number>;
  } {
    const retriesByOperation: Record<string, number> = {};
    let successfulRetries = 0;
    let failedRetries = 0;
    let totalAttempts = 0;

    for (const event of this.retryHistory) {
      retriesByOperation[event.operation] = (retriesByOperation[event.operation] || 0) + 1;

      if (event.error) {
        failedRetries++;
      } else {
        successfulRetries++;
      }

      totalAttempts += event.attempt;
    }

    const totalRetries = this.retryHistory.length;
    const averageAttempts = totalRetries > 0 ? totalAttempts / totalRetries : 0;

    return {
      totalRetries,
      successfulRetries,
      failedRetries,
      averageAttempts,
      retriesByOperation,
    };
  }

  /**
   * Get recent retry events
   */
  getRecentRetryEvents(limit: number = 50): RetryEvent[] {
    return this.retryHistory.slice(-limit);
  }

  /**
   * Clear retry history
   */
  clearRetryHistory(): void {
    this.retryHistory = [];
    this.emit('retryHistoryCleared', { timestamp: Date.now() });
  }

  /**
   * Get active retry operations
   */
  getActiveRetries(): string[] {
    return Array.from(this.activeRetries.keys());
  }

  /**
   * Check if any retries are active
   */
  hasActiveRetries(): boolean {
    return this.activeRetries.size > 0;
  }

  /**
   * Create a custom retry strategy
   */
  createCustomStrategy(options: Partial<RetryStrategy>): RetryStrategy {
    return { ...DEFAULT_RETRY_STRATEGY, ...options };
  }

  /**
   * Set default retry strategy
   */
  setDefaultStrategy(options: Partial<RetryStrategy>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current default strategy
   */
  getDefaultStrategy(): RetryStrategy {
    return { ...DEFAULT_RETRY_STRATEGY, ...this.options };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.retryHistory = [];
    this.activeRetries.clear();
    this.removeAllListeners();
  }
}

/**
 * Factory function to create retry manager
 */
export function createRetryManager(errorHandler?: ErrorHandler, options?: Partial<RetryStrategy>): RetryManager {
  return new RetryManager(errorHandler, options);
}