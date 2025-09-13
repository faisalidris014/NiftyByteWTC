import { EventEmitter } from 'events';
import { ErrorHandler, ErrorContext } from './error-handler';

// Fallback strategy types
export type FallbackStrategy = 'none' | 'defaultValue' | 'alternativeOperation' | 'cachedResult' | 'degradedMode' | 'custom';

// Fallback configuration
export interface FallbackOptions<T = any> {
  strategy: FallbackStrategy;
  defaultValue?: T;
  alternativeOperation?: () => T | Promise<T>;
  cacheKey?: string;
  cacheTTLMs?: number;
  degradedModeHandler?: () => void;
  customHandler?: (error: Error, context: any) => T | Promise<T>;
  shouldFallback?: (error: Error) => boolean;
}

// Fallback event
export interface FallbackEvent<T = any> {
  strategy: FallbackStrategy;
  originalError: Error;
  fallbackResult?: T;
  fallbackError?: Error;
  timestamp: number;
  operation: string;
  success: boolean;
}

// Fallback cache entry
interface FallbackCacheEntry<T = any> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Comprehensive fallback strategy manager for graceful degradation
 */
export class FallbackManager extends EventEmitter {
  private fallbackCache: Map<string, FallbackCacheEntry> = new Map();
  private fallbackHistory: FallbackEvent[] = [];
  private options: Partial<FallbackOptions>;

  constructor(
    private errorHandler?: ErrorHandler,
    options: Partial<FallbackOptions> = {}
  ) {
    super();
    this.options = options;
  }

  /**
   * Execute operation with fallback strategy
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallbackOptions: FallbackOptions<T>,
    operationName: string = 'unknown',
    context: any = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const executionError = error as Error;

      // Check if fallback should be attempted
      if (fallbackOptions.shouldFallback && !fallbackOptions.shouldFallback(executionError)) {
        throw executionError;
      }

      try {
        const fallbackResult = await this.executeFallbackStrategy(executionError, fallbackOptions, context);

        this.recordFallbackSuccess(
          operationName,
          fallbackOptions.strategy,
          executionError,
          fallbackResult
        );

        return fallbackResult;
      } catch (fallbackError) {
        this.recordFallbackFailure(
          operationName,
          fallbackOptions.strategy,
          executionError,
          fallbackError as Error
        );

        throw fallbackError;
      }
    }
  }

  /**
   * Execute appropriate fallback strategy
   */
  private async executeFallbackStrategy<T>(
    error: Error,
    options: FallbackOptions<T>,
    context: any
  ): Promise<T> {
    switch (options.strategy) {
      case 'defaultValue':
        return this.handleDefaultValue(options);

      case 'alternativeOperation':
        return this.handleAlternativeOperation(options, error, context);

      case 'cachedResult':
        return this.handleCachedResult(options, error);

      case 'degradedMode':
        return this.handleDegradedMode(options, error, context);

      case 'custom':
        return this.handleCustomFallback(options, error, context);

      case 'none':
      default:
        throw error;
    }
  }

  /**
   * Handle default value fallback
   */
  private handleDefaultValue<T>(options: FallbackOptions<T>): T {
    if (options.defaultValue === undefined) {
      throw new Error('Default value fallback strategy requires defaultValue option');
    }
    return options.defaultValue;
  }

  /**
   * Handle alternative operation fallback
   */
  private async handleAlternativeOperation<T>(
    options: FallbackOptions<T>,
    originalError: Error,
    context: any
  ): Promise<T> {
    if (!options.alternativeOperation) {
      throw new Error('Alternative operation fallback strategy requires alternativeOperation option');
    }

    try {
      const result = options.alternativeOperation();
      return await Promise.resolve(result);
    } catch (fallbackError) {
      throw new Error(
        `Alternative operation failed: ${(fallbackError as Error).message}. Original error: ${originalError.message}`
      );
    }
  }

  /**
   * Handle cached result fallback
   */
  private handleCachedResult<T>(options: FallbackOptions<T>, originalError: Error): T {
    if (!options.cacheKey) {
      throw new Error('Cached result fallback strategy requires cacheKey option');
    }

    const cachedEntry = this.fallbackCache.get(options.cacheKey);
    if (!cachedEntry) {
      throw new Error(`No cached result found for key: ${options.cacheKey}. Original error: ${originalError.message}`);
    }

    // Check if cache entry is expired
    if (Date.now() > cachedEntry.expiresAt) {
      this.fallbackCache.delete(options.cacheKey);
      throw new Error(`Cached result expired for key: ${options.cacheKey}. Original error: ${originalError.message}`);
    }

    return cachedEntry.value as T;
  }

  /**
   * Handle degraded mode fallback
   */
  private async handleDegradedMode<T>(
    options: FallbackOptions<T>,
    originalError: Error,
    context: any
  ): Promise<T> {
    if (options.degradedModeHandler) {
      try {
        options.degradedModeHandler();
      } catch (handlerError) {
        // Degraded mode handler errors are non-fatal
        this.emit('degradedModeHandlerError', {
          error: handlerError,
          originalError,
          timestamp: Date.now(),
        });
      }
    }

    // In degraded mode, we typically return a minimal viable response
    // or throw a specific degraded mode error
    throw new Error(`Service operating in degraded mode. Original error: ${originalError.message}`);
  }

  /**
   * Handle custom fallback
   */
  private async handleCustomFallback<T>(
    options: FallbackOptions<T>,
    originalError: Error,
    context: any
  ): Promise<T> {
    if (!options.customHandler) {
      throw new Error('Custom fallback strategy requires customHandler option');
    }

    try {
      const result = options.customHandler(originalError, context);
      return await Promise.resolve(result);
    } catch (fallbackError) {
      throw new Error(
        `Custom fallback handler failed: ${(fallbackError as Error).message}. Original error: ${originalError.message}`
      );
    }
  }

  /**
   * Cache a value for fallback use
   */
  cacheValue<T>(key: string, value: T, ttlMs: number = 300000): void { // 5 minutes default
    const expiresAt = Date.now() + ttlMs;
    this.fallbackCache.set(key, {
      value,
      timestamp: Date.now(),
      expiresAt,
    });

    this.emit('valueCached', { key, value, ttlMs, timestamp: Date.now() });
  }

  /**
   * Get cached value
   */
  getCachedValue<T>(key: string): T | null {
    const entry = this.fallbackCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.fallbackCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Remove cached value
   */
  removeCachedValue(key: string): boolean {
    return this.fallbackCache.delete(key);
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    const now = Date.now();
    let clearedCount = 0;

    for (const [key, entry] of this.fallbackCache.entries()) {
      if (now > entry.expiresAt) {
        this.fallbackCache.delete(key);
        clearedCount++;
      }
    }

    return clearedCount;
  }

  /**
   * Record successful fallback
   */
  private recordFallbackSuccess<T>(
    operationName: string,
    strategy: FallbackStrategy,
    originalError: Error,
    result: T
  ): void {
    const event: FallbackEvent<T> = {
      strategy,
      originalError,
      fallbackResult: result,
      timestamp: Date.now(),
      operation: operationName,
      success: true,
    };

    this.fallbackHistory.push(event);
    this.emit('fallbackSuccess', event);

    // Log fallback success
    if (this.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          operation: operationName,
          strategy,
          fallbackResult: result,
        },
      };

      this.errorHandler.handleError(
        originalError,
        'FALLBACK_SUCCESS',
        context,
        'warning',
        false
      );
    }
  }

  /**
   * Record fallback failure
   */
  private recordFallbackFailure(
    operationName: string,
    strategy: FallbackStrategy,
    originalError: Error,
    fallbackError: Error
  ): void {
    const event: FallbackEvent = {
      strategy,
      originalError,
      fallbackError,
      timestamp: Date.now(),
      operation: operationName,
      success: false,
    };

    this.fallbackHistory.push(event);
    this.emit('fallbackFailure', event);

    // Log fallback failure
    if (this.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          operation: operationName,
          strategy,
          fallbackError: fallbackError.message,
        },
      };

      this.errorHandler.handleError(
        fallbackError,
        'FALLBACK_FAILURE',
        context,
        'error',
        false
      );
    }
  }

  /**
   * Get fallback statistics
   */
  getFallbackStatistics(): {
    totalFallbacks: number;
    successfulFallbacks: number;
    failedFallbacks: number;
    fallbacksByStrategy: Record<FallbackStrategy, number>;
    fallbacksByOperation: Record<string, number>;
    cacheSize: number;
    cacheHitRate: number;
  } {
    const fallbacksByStrategy: Record<FallbackStrategy, number> = {
      none: 0,
      defaultValue: 0,
      alternativeOperation: 0,
      cachedResult: 0,
      degradedMode: 0,
      custom: 0,
    };

    const fallbacksByOperation: Record<string, number> = {};
    let successfulFallbacks = 0;
    let failedFallbacks = 0;

    for (const event of this.fallbackHistory) {
      fallbacksByStrategy[event.strategy] = (fallbacksByStrategy[event.strategy] || 0) + 1;
      fallbacksByOperation[event.operation] = (fallbacksByOperation[event.operation] || 0) + 1;

      if (event.success) {
        successfulFallbacks++;
      } else {
        failedFallbacks++;
      }
    }

    const totalCacheAccess = this.fallbackHistory.filter(e => e.strategy === 'cachedResult').length;
    const cacheHits = this.fallbackHistory.filter(e => e.strategy === 'cachedResult' && e.success).length;
    const cacheHitRate = totalCacheAccess > 0 ? (cacheHits / totalCacheAccess) * 100 : 0;

    return {
      totalFallbacks: this.fallbackHistory.length,
      successfulFallbacks,
      failedFallbacks,
      fallbacksByStrategy,
      fallbacksByOperation,
      cacheSize: this.fallbackCache.size,
      cacheHitRate,
    };
  }

  /**
   * Get recent fallback events
   */
  getRecentFallbackEvents(limit: number = 50): FallbackEvent[] {
    return this.fallbackHistory.slice(-limit);
  }

  /**
   * Clear fallback history
   */
  clearFallbackHistory(): void {
    this.fallbackHistory = [];
    this.emit('fallbackHistoryCleared', { timestamp: Date.now() });
  }

  /**
   * Clear all cached values
   */
  clearAllCache(): void {
    this.fallbackCache.clear();
    this.emit('cacheCleared', { timestamp: Date.now() });
  }

  /**
   * Set default fallback options
   */
  setDefaultOptions(options: Partial<FallbackOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get default fallback options
   */
  getDefaultOptions(): Partial<FallbackOptions> {
    return { ...this.options };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.fallbackHistory = [];
    this.fallbackCache.clear();
    this.removeAllListeners();
  }
}

/**
 * Factory function to create fallback manager
 */
export function createFallbackManager(errorHandler?: ErrorHandler, options?: Partial<FallbackOptions>): FallbackManager {
  return new FallbackManager(errorHandler, options);
}