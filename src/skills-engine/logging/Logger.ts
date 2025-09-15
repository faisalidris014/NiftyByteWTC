import { LogEntry, LogLevel, LogDestination, LoggerConfig } from './types';
import { ConsoleDestination } from './destinations/ConsoleDestination';
import { FileDestination } from './destinations/FileDestination';
import { DatabaseDestination } from './destinations/DatabaseDestination';
import * as crypto from 'crypto';

export class Logger {
  private destinations: LogDestination[] = [];
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      defaultLevel: config.defaultLevel || 'info',
      destinations: config.destinations || [],
      correlationIdHeader: config.correlationIdHeader || 'x-correlation-id',
      includeStackTrace: config.includeStackTrace !== false,
      maxContextDepth: config.maxContextDepth || 3,
      bufferSize: config.bufferSize || 1000,
      flushIntervalMs: config.flushIntervalMs || 5000,
      ...config
    };

    this.initializeDestinations();
    this.setupBuffering();
  }

  private initializeDestinations(): void {
    for (const destConfig of this.config.destinations) {
      if (!destConfig.enabled) continue;

      try {
        let destination: LogDestination;

        switch (destConfig.type) {
          case 'console':
            destination = new ConsoleDestination();
            break;

          case 'file':
            destination = new FileDestination({
              filePath: destConfig.options?.filePath || './logs/app.log',
              rotation: destConfig.rotation,
              format: destConfig.options?.format || 'text'
            });
            break;

          case 'database':
            destination = new DatabaseDestination({
              connectionString: destConfig.options?.connectionString || '',
              tableName: destConfig.options?.tableName,
              batchSize: destConfig.options?.batchSize,
              flushIntervalMs: destConfig.options?.flushIntervalMs
            });
            break;

          default:
            console.warn(`Unknown destination type: ${destConfig.type}`);
            continue;
        }

        this.destinations.push(destination);
      } catch (error) {
        console.error(`Failed to initialize destination ${destConfig.type}:`, error);
      }
    }

    // Always add console destination if no destinations configured
    if (this.destinations.length === 0) {
      this.destinations.push(new ConsoleDestination());
    }
  }

  private setupBuffering(): void {
    if (this.config.bufferSize > 0) {
      this.flushTimer = setInterval(() => {
        this.flushBuffer().catch(console.error);
      }, this.config.flushIntervalMs);
    }
  }

  private generateCorrelationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private shouldLog(level: LogLevel, destinationLevel: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal', 'audit'];
    const levelIndex = levels.indexOf(level);
    const destLevelIndex = levels.indexOf(destinationLevel);
    return levelIndex >= destLevelIndex;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error,
    metadata?: Partial<LogEntry>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      component: metadata?.component || 'unknown',
      correlationId: metadata?.correlationId || this.generateCorrelationId(),
      skillId: metadata?.skillId,
      executionId: metadata?.executionId,
      userId: metadata?.userId,
      durationMs: metadata?.durationMs,
      resourceUsage: metadata?.resourceUsage,
      securityEvents: metadata?.securityEvents,
      context: this.sanitizeContext(context),
      error: error ? this.sanitizeError(error) : undefined
    };

    return entry;
  }

  private sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) continue;

      // Prevent circular references and limit depth
      try {
        const stringified = JSON.stringify(value, (k, v) => {
          if (typeof v === 'object' && v !== null) {
            if (Array.isArray(v)) return v.slice(0, 100); // Limit array size
            return Object.fromEntries(
              Object.entries(v)
                .slice(0, 50)
                .map(([k, v]) => [k, typeof v === 'object' ? '[Object]' : v])
            );
          }
          return v;
        });

        sanitized[key] = JSON.parse(stringified);
      } catch {
        sanitized[key] = '[Circular or unserializable]';
      }
    }

    return sanitized;
  }

  private sanitizeError(error: Error): Error {
    if (!this.config.includeStackTrace) {
      return new Error(error.message);
    }
    return error;
  }

  private async writeToDestinations(entry: LogEntry): Promise<void> {
    const writePromises = this.destinations.map(async (destination) => {
      try {
        await destination.write(entry);
      } catch (error) {
        console.error('Failed to write to destination:', error);
      }
    });

    await Promise.allSettled(writePromises);
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    for (const entry of entries) {
      await this.writeToDestinations(entry);
    }
  }

  // Public logging methods
  debug(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('debug', message, context, undefined, metadata);
  }

  info(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('info', message, context, undefined, metadata);
  }

  warn(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('warn', message, context, undefined, metadata);
  }

  error(message: string, error?: Error, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('error', message, context, error, metadata);
  }

  fatal(message: string, error?: Error, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('fatal', message, context, error, metadata);
  }

  audit(message: string, context?: Record<string, any>, metadata?: Partial<LogEntry>): void {
    this.log('audit', message, context, undefined, metadata);
  }

  log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error,
    metadata?: Partial<LogEntry>
  ): void {
    const entry = this.createLogEntry(level, message, context, error, metadata);

    if (this.config.bufferSize > 0) {
      this.buffer.push(entry);

      if (this.buffer.length >= this.config.bufferSize) {
        this.flushBuffer().catch(console.error);
      }
    } else {
      this.writeToDestinations(entry).catch(console.error);
    }
  }

  async flush(): Promise<void> {
    await this.flushBuffer();

    const flushPromises = this.destinations.map(async (destination) => {
      if (destination.flush) {
        await destination.flush();
      }
    });

    await Promise.allSettled(flushPromises);
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();

    const closePromises = this.destinations.map(async (destination) => {
      if (destination.close) {
        await destination.close();
      }
    });

    await Promise.allSettled(closePromises);
  }

  // Performance monitoring methods
  startTimer(operation: string, metadata?: Partial<LogEntry>): () => number {
    const startTime = Date.now();
    const correlationId = metadata?.correlationId || this.generateCorrelationId();

    this.debug(`Starting operation: ${operation}`, { operation }, {
      ...metadata,
      correlationId
    });

    return () => {
      const duration = Date.now() - startTime;
      this.debug(`Completed operation: ${operation}`, {
        operation,
        durationMs: duration
      }, {
        ...metadata,
        correlationId,
        durationMs: duration
      });
      return duration;
    };
  }

  // Get current configuration
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  // Get active destinations
  getDestinations(): string[] {
    return this.destinations.map(dest => dest.constructor.name);
  }
}