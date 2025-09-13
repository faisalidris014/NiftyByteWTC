import { EventEmitter } from 'events';

// Error severity levels
export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

// Error context information
export interface ErrorContext {
  skillId?: string;
  scriptType?: string;
  scriptPath?: string;
  processId?: number;
  userId?: string;
  timestamp: number;
  environment?: Record<string, string>;
  stackTrace?: string;
  additionalData?: Record<string, any>;
}

// Error event
export interface ErrorEvent {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context: ErrorContext;
  retryable: boolean;
  handled: boolean;
}

// Error handler configuration
export interface ErrorHandlerOptions {
  maxErrors: number;
  errorExpiryMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  logToConsole: boolean;
  enableReporting: boolean;
  severityThreshold: ErrorSeverity;
}

// Error codes and messages
export const ERROR_CODES = {
  // Sandbox errors
  SANDBOX_TIMEOUT: 'SANDBOX_TIMEOUT',
  SANDBOX_MEMORY_EXCEEDED: 'SANDBOX_MEMORY_EXCEEDED',
  SANDBOX_DISK_EXCEEDED: 'SANDBOX_DISK_EXCEEDED',
  SANDBOX_NETWORK_EXCEEDED: 'SANDBOX_NETWORK_EXCEEDED',
  SANDBOX_PROCESS_LIMIT: 'SANDBOX_PROCESS_LIMIT',

  // Filesystem errors
  FS_ACCESS_DENIED: 'FS_ACCESS_DENIED',
  FS_QUOTA_EXCEEDED: 'FS_QUOTA_EXCEEDED',
  FS_OPERATION_BLOCKED: 'FS_OPERATION_BLOCKED',

  // Network errors
  NETWORK_ACCESS_DENIED: 'NETWORK_ACCESS_DENIED',
  NETWORK_BANDWIDTH_EXCEEDED: 'NETWORK_BANDWIDTH_EXCEEDED',
  NETWORK_CONNECTION_LIMIT: 'NETWORK_CONNECTION_LIMIT',

  // Security errors
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  SUSPICIOUS_BEHAVIOR: 'SUSPICIOUS_BEHAVIOR',
  MALICIOUS_ACTIVITY: 'MALICIOUS_ACTIVITY',

  // Process errors
  PROCESS_EXECUTION_FAILED: 'PROCESS_EXECUTION_FAILED',
  PROCESS_TIMEOUT: 'PROCESS_TIMEOUT',
  PROCESS_TERMINATED: 'PROCESS_TERMINATED',

  // Resource errors
  RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',
  RESOURCE_LEAK: 'RESOURCE_LEAK',
  CLEANUP_FAILED: 'CLEANUP_FAILED',

  // IPC errors
  IPC_CONNECTION_FAILED: 'IPC_CONNECTION_FAILED',
  IPC_TIMEOUT: 'IPC_TIMEOUT',
  IPC_VALIDATION_FAILED: 'IPC_VALIDATION_FAILED',

  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // Resilience system errors
  HOOK_EXECUTION_FAILED: 'HOOK_EXECUTION_FAILED',
  FALLBACK_SUCCESS: 'FALLBACK_SUCCESS',
  FALLBACK_FAILURE: 'FALLBACK_FAILURE',
  RETRY_ATTEMPT: 'RETRY_ATTEMPT',
  RETRY_MAX_ATTEMPTS: 'RETRY_MAX_ATTEMPTS',
  RETRY_FAILURE: 'RETRY_FAILURE',
  EXECUTION_FAILED: 'EXECUTION_FAILED'
} as const;

/**
 * Comprehensive error handling and logging system for sandbox
 */
export class ErrorHandler extends EventEmitter {
  private errors: ErrorEvent[] = [];
  private errorCounts: Map<string, number> = new Map();
  private lastErrorTimestamps: Map<string, number> = new Map();

  constructor(private options: ErrorHandlerOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      maxErrors: 1000,
      errorExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
      retryAttempts: 3,
      retryDelayMs: 1000,
      logToConsole: true,
      enableReporting: true,
      severityThreshold: 'warning',
      ...this.options
    };
  }

  /**
   * Handle an error with proper context and logging
   */
  handleError(
    error: Error | string,
    code: keyof typeof ERROR_CODES = 'UNKNOWN_ERROR',
    context: Partial<ErrorContext> = {},
    severity: ErrorSeverity = 'error',
    retryable: boolean = false
  ): ErrorEvent {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stackTrace = typeof error === 'object' ? error.stack : undefined;

    const errorEvent: ErrorEvent = {
      id: this.generateErrorId(),
      code: ERROR_CODES[code] || code,
      message: errorMessage,
      severity,
      timestamp: Date.now(),
      context: {
        timestamp: Date.now(),
        stackTrace,
        ...context
      },
      retryable,
      handled: false
    };

    // Add to error history
    this.addErrorToHistory(errorEvent);

    // Log to console if enabled
    if (this.options.logToConsole) {
      this.logToConsole(errorEvent);
    }

    // Emit event for external handling
    this.emit('error', errorEvent);

    // Report error if severity meets threshold
    if (this.shouldReportError(severity)) {
      this.reportError(errorEvent);
    }

    return errorEvent;
  }

  /**
   * Handle and rethrow error for async operations
   */
  async handleAsyncError<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext> = {},
    retryable: boolean = false
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const errorEvent = this.handleError(
        error as Error,
        'UNKNOWN_ERROR',
        context,
        'error',
        retryable
      );

      if (retryable && this.options.retryAttempts > 0) {
        return this.retryOperation(operation, context, errorEvent);
      }

      throw error;
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>,
    originalError: ErrorEvent
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await this.delay(this.calculateRetryDelay(attempt));
        return await operation();
      } catch (error) {
        if (attempt === this.options.retryAttempts) {
          // Final attempt failed
          this.handleError(
            error as Error,
            originalError.code as keyof typeof ERROR_CODES,
            {
              ...context,
              additionalData: {
                retryAttempts: attempt,
                originalErrorId: originalError.id
              }
            },
            'error',
            false
          );
          throw error;
        }

        // Log retry attempt
        this.handleError(
          error as Error,
          originalError.code as keyof typeof ERROR_CODES,
          {
            ...context,
            additionalData: {
              retryAttempt: attempt,
              totalAttempts: this.options.retryAttempts,
              originalErrorId: originalError.id
            }
          },
          'warning',
          true
        );
      }
    }

    throw new Error('Retry logic failed');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return Math.min(
      this.options.retryDelayMs * Math.pow(2, attempt - 1),
      30000 // Max 30 seconds
    );
  }

  /**
   * Add error to history with cleanup
   */
  private addErrorToHistory(errorEvent: ErrorEvent): void {
    // Clean up old errors
    this.cleanupOldErrors();

    // Add to errors array
    this.errors.push(errorEvent);

    // Update error counts
    const count = this.errorCounts.get(errorEvent.code) || 0;
    this.errorCounts.set(errorEvent.code, count + 1);
    this.lastErrorTimestamps.set(errorEvent.code, errorEvent.timestamp);

    // Limit total errors stored
    if (this.errors.length > this.options.maxErrors) {
      this.errors = this.errors.slice(-this.options.maxErrors);
    }
  }

  /**
   * Clean up old errors
   */
  private cleanupOldErrors(): void {
    const now = Date.now();
    this.errors = this.errors.filter(
      error => now - error.timestamp < this.options.errorExpiryMs
    );
  }

  /**
   * Log error to console
   */
  private logToConsole(errorEvent: ErrorEvent): void {
    const timestamp = new Date(errorEvent.timestamp).toISOString();
    const level = errorEvent.severity.toUpperCase();
    const contextInfo = errorEvent.context.skillId
      ? ` [skill: ${errorEvent.context.skillId}]`
      : '';

    const message = `[${timestamp}] ${level}: ${errorEvent.code}${contextInfo} - ${errorEvent.message}`;

    switch (errorEvent.severity) {
      case 'critical':
      case 'error':
        console.error(message);
        if (errorEvent.context.stackTrace) {
          console.error(errorEvent.context.stackTrace);
        }
        break;
      case 'warning':
        console.warn(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'debug':
        console.debug(message);
        break;
    }
  }

  /**
   * Report error to external systems
   */
  private reportError(errorEvent: ErrorEvent): void {
    if (!this.options.enableReporting) return;

    // Here you would integrate with external error reporting services
    // like Sentry, LogRocket, or custom monitoring systems

    this.emit('errorReported', errorEvent);
  }

  /**
   * Check if error should be reported based on severity
   */
  private shouldReportError(severity: ErrorSeverity): boolean {
    const severityLevels: ErrorSeverity[] = ['debug', 'info', 'warning', 'error', 'critical'];
    const thresholdIndex = severityLevels.indexOf(this.options.severityThreshold);
    const errorIndex = severityLevels.indexOf(severity);

    return errorIndex >= thresholdIndex;
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all errors
   */
  getAllErrors(): ErrorEvent[] {
    return [...this.errors];
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ErrorEvent[] {
    return this.errors.filter(error => error.severity === severity);
  }

  /**
   * Get errors by code
   */
  getErrorsByCode(code: string): ErrorEvent[] {
    return this.errors.filter(error => error.code === code);
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsBySeverity: Record<ErrorSeverity, number>;
    errorsByCode: Record<string, number>;
    lastErrorTimestamp: number | null;
  } {
    const errorsBySeverity: Record<ErrorSeverity, number> = {
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };

    const errorsByCode: Record<string, number> = {};
    let lastErrorTimestamp: number | null = null;

    for (const error of this.errors) {
      errorsBySeverity[error.severity]++;
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;

      if (!lastErrorTimestamp || error.timestamp > lastErrorTimestamp) {
        lastErrorTimestamp = error.timestamp;
      }
    }

    return {
      totalErrors: this.errors.length,
      errorsBySeverity,
      errorsByCode,
      lastErrorTimestamp
    };
  }

  /**
   * Get error rate (errors per minute)
   */
  getErrorRate(): number {
    if (this.errors.length === 0) return 0;

    const firstError = this.errors[0];
    const lastError = this.errors[this.errors.length - 1];
    const timeSpanMinutes = (lastError.timestamp - firstError.timestamp) / 60000;

    return timeSpanMinutes > 0 ? this.errors.length / timeSpanMinutes : 0;
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errors = [];
    this.errorCounts.clear();
    this.lastErrorTimestamps.clear();
  }

  /**
   * Mark error as handled
   */
  markErrorAsHandled(errorId: string): boolean {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.handled = true;
      return true;
    }
    return false;
  }

  /**
   * Check if error code is frequent
   */
  isErrorFrequent(code: string, threshold: number = 10): boolean {
    const count = this.errorCounts.get(code) || 0;
    return count >= threshold;
  }

  /**
   * Get time since last error of specific code
   */
  getTimeSinceLastError(code: string): number | null {
    const lastTimestamp = this.lastErrorTimestamps.get(code);
    return lastTimestamp ? Date.now() - lastTimestamp : null;
  }
}