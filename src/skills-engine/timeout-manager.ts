import { EventEmitter } from 'events';
import { ErrorHandler, ErrorContext, ErrorSeverity } from './error-handler';

// Timeout configuration levels
interface TimeoutLevels {
  global: number; // Global timeout for entire operation
  execution: number; // Execution timeout for script
  resource: number; // Resource monitoring timeout
  cleanup: number; // Cleanup operation timeout
}

// Timeout event types
export interface TimeoutEvent {
  type: 'global' | 'execution' | 'resource' | 'cleanup' | 'custom';
  level: string;
  timeoutMs: number;
  elapsedMs: number;
  context: Record<string, any>;
  timestamp: number;
}

// Timeout manager options
export interface TimeoutManagerOptions {
  defaultTimeouts: Partial<TimeoutLevels>;
  enableGracefulShutdown: boolean;
  gracePeriodMs: number;
  maxNestedTimeouts: number;
  errorHandler?: ErrorHandler;
}

// Default timeout configuration
const DEFAULT_TIMEOUTS: TimeoutLevels = {
  global: 60000, // 60 seconds
  execution: 30000, // 30 seconds
  resource: 10000, // 10 seconds
  cleanup: 5000, // 5 seconds
};

/**
 * Comprehensive timeout management system with multiple levels and graceful handling
 */
export class TimeoutManager extends EventEmitter {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private timeoutEvents: TimeoutEvent[] = [];
  private activeTimeouts: Set<string> = new Set();
  private options: TimeoutManagerOptions;

  constructor(options: Partial<TimeoutManagerOptions> = {}) {
    super();
    this.options = {
      defaultTimeouts: { ...DEFAULT_TIMEOUTS, ...options.defaultTimeouts },
      enableGracefulShutdown: options.enableGracefulShutdown ?? true,
      gracePeriodMs: options.gracePeriodMs ?? 2000,
      maxNestedTimeouts: options.maxNestedTimeouts ?? 10,
      errorHandler: options.errorHandler,
    };
  }

  /**
   * Set a timeout with proper cleanup and error handling
   */
  setTimeout(
    level: keyof TimeoutLevels | string,
    timeoutMs: number,
    callback: () => void,
    context: Record<string, any> = {},
    customId?: string
  ): string {
    const timeoutId = customId || this.generateTimeoutId(level);

    if (this.activeTimeouts.size >= this.options.maxNestedTimeouts) {
      this.handleTimeoutError('MAX_NESTED_TIMEOUTS', `Maximum nested timeouts (${this.options.maxNestedTimeouts}) exceeded`, level, timeoutMs, context);
      return timeoutId;
    }

    const startTime = Date.now();

    const timeout = setTimeout(() => {
      const elapsedMs = Date.now() - startTime;
      const timeoutEvent: TimeoutEvent = {
        type: this.isStandardLevel(level) ? level : 'custom',
        level: level.toString(),
        timeoutMs,
        elapsedMs,
        context,
        timestamp: Date.now(),
      };

      this.timeoutEvents.push(timeoutEvent);
      this.emit('timeout', timeoutEvent);

      // Handle graceful shutdown if enabled
      if (this.options.enableGracefulShutdown) {
        this.handleGracefulTimeout(timeoutEvent, callback);
      } else {
        callback();
      }

      this.cleanupTimeout(timeoutId);
    }, timeoutMs);

    this.timeouts.set(timeoutId, timeout);
    this.activeTimeouts.add(timeoutId);

    return timeoutId;
  }

  /**
   * Handle timeout with graceful shutdown period
   */
  private handleGracefulTimeout(event: TimeoutEvent, originalCallback: () => void): void {
    const gracePeriod = this.options.gracePeriodMs;

    // Emit warning before forceful termination
    this.emit('timeoutWarning', {
      ...event,
      gracePeriodMs: gracePeriod,
      message: `Timeout reached, graceful shutdown in ${gracePeriod}ms`,
    });

    // Give a grace period for cleanup
    setTimeout(() => {
      this.emit('timeoutForceful', {
        ...event,
        message: 'Grace period expired, executing timeout callback',
      });
      originalCallback();
    }, gracePeriod);
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(timeoutId: string): boolean {
    const timeout = this.timeouts.get(timeoutId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(timeoutId);
      this.activeTimeouts.delete(timeoutId);
      this.emit('timeoutCleared', { timeoutId, timestamp: Date.now() });
      return true;
    }
    return false;
  }

  /**
   * Clear all active timeouts
   */
  clearAllTimeouts(): void {
    for (const [timeoutId, timeout] of this.timeouts) {
      clearTimeout(timeout);
      this.activeTimeouts.delete(timeoutId);
    }
    this.timeouts.clear();
    this.emit('allTimeoutsCleared', { count: this.timeouts.size, timestamp: Date.now() });
  }

  /**
   * Execute function with timeout protection
   */
  async withTimeout<T>(
    level: keyof TimeoutLevels | string,
    operation: () => Promise<T>,
    timeoutMs?: number,
    context: Record<string, any> = {},
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const actualTimeoutMs = timeoutMs ?? this.getDefaultTimeout(level);
    const timeoutId = this.generateTimeoutId(level);

    return new Promise<T>(async (resolve, reject) => {
      // Set timeout
      const timeoutRef = this.setTimeout(
        level,
        actualTimeoutMs,
        () => {
          const error = new Error(`Operation timed out after ${actualTimeoutMs}ms (level: ${level})`);

          if (fallback) {
            try {
              const fallbackResult = fallback();
              if (fallbackResult instanceof Promise) {
                fallbackResult.then(resolve).catch(reject);
              } else {
                resolve(fallbackResult);
              }
            } catch (fallbackError) {
              reject(fallbackError);
            }
          } else {
            this.handleTimeoutError('OPERATION_TIMEOUT', error.message, level, actualTimeoutMs, context);
            reject(error);
          }
        },
        context,
        timeoutId
      );

      try {
        const result = await operation();
        this.clearTimeout(timeoutRef);
        resolve(result);
      } catch (error) {
        this.clearTimeout(timeoutRef);
        reject(error);
      }
    });
  }

  /**
   * Handle timeout errors with proper reporting
   */
  private handleTimeoutError(
    code: string,
    message: string,
    level: string,
    timeoutMs: number,
    context: Record<string, any>
  ): void {
    const errorContext: ErrorContext = {
      timestamp: Date.now(),
      additionalData: {
        timeoutLevel: level,
        timeoutMs,
        ...context,
      },
    };

    if (this.options.errorHandler) {
      this.options.errorHandler.handleError(
        new Error(message),
        code as any,
        errorContext,
        'error',
        false
      );
    }

    this.emit('timeoutError', {
      code,
      message,
      level,
      timeoutMs,
      context: errorContext,
      timestamp: Date.now(),
    });
  }

  /**
   * Get default timeout for a level
   */
  private getDefaultTimeout(level: keyof TimeoutLevels | string): number {
    if (this.isStandardLevel(level)) {
      return this.options.defaultTimeouts[level as keyof TimeoutLevels] ?? DEFAULT_TIMEOUTS[level as keyof TimeoutLevels];
    }
    return this.options.defaultTimeouts.execution ?? DEFAULT_TIMEOUTS.execution;
  }

  /**
   * Check if level is a standard timeout level
   */
  private isStandardLevel(level: string): level is keyof TimeoutLevels {
    return Object.keys(DEFAULT_TIMEOUTS).includes(level);
  }

  /**
   * Generate unique timeout ID
   */
  private generateTimeoutId(level: string): string {
    return `timeout_${level}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up timeout resources
   */
  private cleanupTimeout(timeoutId: string): void {
    this.timeouts.delete(timeoutId);
    this.activeTimeouts.delete(timeoutId);
  }

  /**
   * Get all active timeout IDs
   */
  getActiveTimeouts(): string[] {
    return Array.from(this.activeTimeouts);
  }

  /**
   * Get timeout statistics
   */
  getTimeoutStatistics(): {
    totalTimeouts: number;
    activeTimeouts: number;
    timeoutEvents: number;
    eventsByLevel: Record<string, number>;
  } {
    const eventsByLevel: Record<string, number> = {};

    for (const event of this.timeoutEvents) {
      eventsByLevel[event.level] = (eventsByLevel[event.level] || 0) + 1;
    }

    return {
      totalTimeouts: this.timeoutEvents.length,
      activeTimeouts: this.activeTimeouts.size,
      timeoutEvents: this.timeoutEvents.length,
      eventsByLevel,
    };
  }

  /**
   * Clear timeout history
   */
  clearTimeoutHistory(): void {
    this.timeoutEvents = [];
    this.emit('timeoutHistoryCleared', { timestamp: Date.now() });
  }

  /**
   * Get recent timeout events
   */
  getRecentTimeoutEvents(limit: number = 50): TimeoutEvent[] {
    return this.timeoutEvents.slice(-limit);
  }

  /**
   * Check if any timeouts are active
   */
  hasActiveTimeouts(): boolean {
    return this.activeTimeouts.size > 0;
  }

  /**
   * Set timeout manager options
   */
  setOptions(options: Partial<TimeoutManagerOptions>): void {
    this.options = { ...this.options, ...options };
    this.emit('optionsUpdated', { options: this.options, timestamp: Date.now() });
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAllTimeouts();
    this.timeoutEvents = [];
    this.activeTimeouts.clear();
    this.removeAllListeners();
  }
}

/**
 * Factory function to create timeout manager with default configuration
 */
export function createTimeoutManager(options?: Partial<TimeoutManagerOptions>): TimeoutManager {
  return new TimeoutManager(options);
}