import { LogEntry, LogDestination } from '../types';

interface DatabaseOptions {
  connectionString: string;
  tableName?: string;
  batchSize?: number;
  flushIntervalMs?: number;
}

export class DatabaseDestination implements LogDestination {
  private batch: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(private options: DatabaseOptions) {
    this.setupBatching();
  }

  private setupBatching(): void {
    const flushInterval = this.options.flushIntervalMs || 5000;
    this.flushTimer = setInterval(() => {
      this.flushBatch().catch(console.error);
    }, flushInterval);
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      // Implement database connection logic here
      // This would connect to PostgreSQL, MySQL, MongoDB, etc.
      // For now, we'll simulate connection
      this.isConnected = true;
    }
  }

  async write(entry: LogEntry): Promise<void> {
    this.batch.push(entry);

    if (this.batch.length >= (this.options.batchSize || 100)) {
      await this.flushBatch();
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return;

    const batchToFlush = [...this.batch];
    this.batch = [];

    try {
      await this.ensureConnection();

      // Convert log entries to database format
      const dbRecords = batchToFlush.map(entry => ({
        timestamp: new Date(entry.timestamp),
        level: entry.level,
        message: entry.message,
        correlation_id: entry.correlationId,
        skill_id: entry.skillId,
        execution_id: entry.executionId,
        user_id: entry.userId,
        component: entry.component,
        context: entry.context ? JSON.stringify(entry.context) : null,
        error: entry.error ? JSON.stringify({
          message: entry.error.message,
          stack: process.env.NODE_ENV === 'development' ? entry.error.stack : undefined
        }) : null,
        duration_ms: entry.durationMs,
        resource_usage: entry.resourceUsage ? JSON.stringify(entry.resourceUsage) : null,
        security_events: entry.securityEvents ? JSON.stringify(entry.securityEvents) : null,
        created_at: new Date()
      }));

      // Implement actual database insert here
      // This would be specific to your database (PostgreSQL, MySQL, etc.)
      console.log('Would insert', dbRecords.length, 'records into database');

      // Example for PostgreSQL:
      // await pool.query(`
      //   INSERT INTO ${this.options.tableName || 'logs'}
      //   (timestamp, level, message, correlation_id, skill_id, execution_id, user_id,
      //    component, context, error, duration_ms, resource_usage, security_events, created_at)
      //   VALUES ${dbRecords.map((_, i) =>
      //     `($${i*14 + 1}, $${i*14 + 2}, $${i*14 + 3}, $${i*14 + 4}, $${i*14 + 5}, $${i*14 + 6}, $${i*14 + 7},
      //      $${i*14 + 8}, $${i*14 + 9}, $${i*14 + 10}, $${i*14 + 11}, $${i*14 + 12}, $${i*14 + 13}, $${i*14 + 14})`
      //   ).join(', ')}
      // `, dbRecords.flatMap(record => [
      //   record.timestamp, record.level, record.message, record.correlation_id, record.skill_id,
      //   record.execution_id, record.user_id, record.component, record.context, record.error,
      //   record.duration_ms, record.resource_usage, record.security_events, record.created_at
      // ]));

    } catch (error) {
      console.error('Database write failed:', error);
      // Re-add batch to retry later
      this.batch = [...this.batch, ...batchToFlush];
    }
  }

  async flush(): Promise<void> {
    await this.flushBatch();
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flushBatch();

    // Close database connection
    this.isConnected = false;
  }
}