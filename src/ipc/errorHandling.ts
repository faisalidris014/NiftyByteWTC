import {
  IPC_ERROR_CODES,
  ErrorMessage,
  IPCMessageBase
} from '../types/ipc';

export class IPCError extends Error {
  public readonly code: string;
  public readonly details?: any;
  public readonly severity: 'warning' | 'error' | 'fatal';

  constructor(
    code: string,
    message: string,
    options: {
      details?: any;
      severity?: 'warning' | 'error' | 'fatal';
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'IPCError';
    this.code = code;
    this.details = options.details;
    this.severity = options.severity || 'error';
  }

  /**
   * Convert to IPC error message format
   */
  toIPCMessage(correlationId?: string): ErrorMessage {
    return {
      type: 'error',
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      correlationId,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.details
    };
  }

  /**
   * Create timeout error
   */
  static timeout(message: string = 'Operation timed out', details?: any): IPCError {
    return new IPCError(IPC_ERROR_CODES.TIMEOUT, message, {
      details,
      severity: 'error'
    });
  }

  /**
   * Create connection lost error
   */
  static connectionLost(message: string = 'Connection to main process lost', details?: any): IPCError {
    return new IPCError(IPC_ERROR_CODES.CONNECTION_LOST, message, {
      details,
      severity: 'fatal'
    });
  }

  /**
   * Create invalid message error
   */
  static invalidMessage(message: string = 'Invalid message format', details?: any): IPCError {
    return new IPCError(IPC_ERROR_CODES.INVALID_MESSAGE, message, {
      details,
      severity: 'error'
    });
  }

  /**
   * Create skill not found error
   */
  static skillNotFound(skillId: string): IPCError {
    return new IPCError(IPC_ERROR_CODES.SKILL_NOT_FOUND, `Skill '${skillId}' not found`, {
      details: { skillId },
      severity: 'error'
    });
  }

  /**
   * Create skill execution error
   */
  static skillExecutionFailed(message: string, details?: any): IPCError {
    return new IPCError(IPC_ERROR_CODES.SKILL_EXECUTION_FAILED, message, {
      details,
      severity: 'error'
    });
  }

  /**
   * Create permission denied error
   */
  static permissionDenied(message: string = 'Permission denied', details?: any): IPCError {
    return new IPCError(IPC_ERROR_CODES.PERMISSION_DENIED, message, {
      details,
      severity: 'error'
    });
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes = [
      IPC_ERROR_CODES.TIMEOUT,
      IPC_ERROR_CODES.CONNECTION_LOST
    ];
    
    return retryableCodes.includes(this.code) && this.severity !== 'fatal';
  }

  /**
   * Check if error should be logged
   */
  shouldLog(): boolean {
    return this.severity === 'error' || this.severity === 'fatal';
  }
}

/**
 * Retry mechanism for IPC operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    shouldRetry = (error: Error) => error instanceof IPCError && error.isRetryable()
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (!shouldRetry(error as Error) || attempt === maxAttempts) {
        break;
      }

      // Exponential backoff with jitter
      const backoff = delayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 200 - 100; // ±100ms jitter
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError!;
}

/**
 * Timeout wrapper for async operations
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(IPCError.timeout(errorMessage));
      }, timeoutMs);
    })
  ]);
}

/**
 * Safe message validation and parsing
 */
export function safeParseIPCMessage(message: any): {
  valid: boolean;
  parsed?: IPCMessageBase;
  error?: Error;
} {
  try {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: new Error('Message must be an object') };
    }

    if (typeof message.messageId !== 'string') {
      return { valid: false, error: new Error('messageId must be a string') };
    }

    if (typeof message.timestamp !== 'number') {
      return { valid: false, error: new Error('timestamp must be a number') };
    }

    if (typeof message.type !== 'string') {
      return { valid: false, error: new Error('type must be a string') };
    }

    return { valid: true, parsed: message as IPCMessageBase };
  } catch (error) {
    return { valid: false, error: error as Error };
  }
}

/**
 * Error logging utility
 */
export function logIPCError(error: Error, context?: any): void {
  if (error instanceof IPCError && error.shouldLog()) {
    console.error(`IPC Error [${error.code}]: ${error.message}`, {
      severity: error.severity,
      details: error.details,
      context,
      stack: error.stack
    });
  } else {
    console.error('Non-IPC Error:', error.message, {
      context,
      stack: error.stack
    });
  }
}