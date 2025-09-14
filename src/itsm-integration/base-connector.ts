import { ITSMConnectionConfig, StandardizedTicketPayload, TicketCreationResult, ConnectionTestResult, RetryConfig, DEFAULT_RETRY_CONFIG, ITSM_ERROR_CODES, ITSMOptions } from './types';
import { createHash, randomBytes } from 'crypto';

export abstract class BaseITSMCConnector {
  protected config: ITSMConnectionConfig;
  protected options: ITSMOptions;
  protected retryConfig: RetryConfig;
  protected isConnected: boolean = false;
  protected lastConnectionTime: number = 0;

  constructor(config: ITSMConnectionConfig, options: ITSMOptions = {}) {
    this.config = config;
    this.options = {
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      validateSSL: true,
      debug: false,
      userAgent: 'WindowsTroubleshootingCompanion/1.0.0',
      ...options
    };
    this.retryConfig = DEFAULT_RETRY_CONFIG;
  }

  /**
   * Initialize the connector
   */
  abstract initialize(): Promise<void>;

  /**
   * Create a ticket in the ITSM system
   */
  abstract createTicket(ticketData: StandardizedTicketPayload): Promise<TicketCreationResult>;

  /**
   * Test the connection to the ITSM system
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Close the connection and cleanup
   */
  abstract close(): Promise<void>;

  /**
   * Validate ticket data before sending
   */
  protected validateTicketData(ticketData: StandardizedTicketPayload): string[] {
    const errors: string[] = [];

    if (!ticketData.summary || ticketData.summary.trim().length === 0) {
      errors.push('Summary is required');
    }

    if (!ticketData.description || ticketData.description.trim().length === 0) {
      errors.push('Description is required');
    }

    if (!ticketData.category || ticketData.category.trim().length === 0) {
      errors.push('Category is required');
    }

    if (!ticketData.user || !ticketData.user.id || !ticketData.user.name) {
      errors.push('User information is required');
    }

    if (!ticketData.systemInfo || !ticketData.systemInfo.deviceId) {
      errors.push('System information is required');
    }

    if (ticketData.summary.length > 255) {
      errors.push('Summary must be less than 255 characters');
    }

    if (ticketData.description.length > 4000) {
      errors.push('Description must be less than 4000 characters');
    }

    return errors;
  }

  /**
   * Retry mechanism with exponential backoff and jitter
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === config.maxAttempts) {
          break;
        }

        const isRetryable = this.isErrorRetryable(error);
        if (!isRetryable) {
          break;
        }

        const delay = this.calculateBackoffDelay(attempt, config);
        if (this.options.debug) {
          console.log(`Retrying ${operationName} in ${delay}ms (attempt ${attempt}/${config.maxAttempts})`);
        }

        await this.delay(delay);
      }
    }

    throw lastError || new Error(`Operation ${operationName} failed after ${config.maxAttempts} attempts`);
  }

  /**
   * Check if an error is retryable
   */
  protected isErrorRetryable(error: any): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorCode = error.code || error.statusCode || error.name;
    const errorMessage = error.message || '';

    // Network-related errors are retryable
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'ENOTFOUND') {
      return true;
    }

    // HTTP status codes that are retryable
    if (typeof errorCode === 'number') {
      return errorCode === 429 || errorCode >= 500;
    }

    // String-based error codes
    if (typeof errorCode === 'string') {
      const retryableCodes = [
        'NETWORK_ERROR',
        'TIMEOUT',
        'RATE_LIMITED',
        'SERVER_ERROR',
        'SERVICE_UNAVAILABLE',
        'ECONNRESET',
        'ETIMEDOUT'
      ];
      return retryableCodes.includes(errorCode.toUpperCase());
    }

    // Check error message for retryable patterns
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /retry/i,
      /rate.*limit/i,
      /server.*error/i,
      /service.*unavailable/i
    ];

    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Calculate backoff delay with jitter
   */
  protected calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1),
      config.maxDelayMs
    );

    if (config.jitter) {
      // Add ±20% jitter
      const jitter = baseDelay * 0.2;
      return baseDelay - jitter + Math.random() * 2 * jitter;
    }

    return baseDelay;
  }

  /**
   * Delay utility function
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique request ID
   */
  protected generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `req_${timestamp}_${random}`;
  }

  /**
   * Create basic authentication header
   */
  protected createBasicAuthHeader(username: string, password: string): string {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Create bearer token header
   */
  protected createBearerTokenHeader(token: string): string {
    return `Bearer ${token}`;
  }

  /**
   * Validate connection configuration
   */
  protected validateConfig(): string[] {
    const errors: string[] = [];

    if (!this.config.baseUrl) {
      errors.push('Base URL is required');
    }

    if (!this.config.credentials) {
      errors.push('Credentials are required');
    }

    if (!this.config.name) {
      errors.push('Connection name is required');
    }

    // Validate URL format
    try {
      new URL(this.config.baseUrl);
    } catch {
      errors.push('Base URL must be a valid URL');
    }

    return errors;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    isConnected: boolean;
    lastConnectionTime: number;
    config: ITSMConnectionConfig;
  } {
    return {
      isConnected: this.isConnected,
      lastConnectionTime: this.lastConnectionTime,
      config: this.config
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ITSMConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig, updatedAt: Date.now() };
  }

  /**
   * Update options
   */
  updateOptions(newOptions: ITSMOptions): void {
    this.options = { ...this.options, ...newOptions };
  }
}