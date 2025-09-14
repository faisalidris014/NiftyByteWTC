import { v4 as uuidv4 } from 'uuid';
import { EncryptedDatabase } from './encrypted-database';
import {
  QueueItem,
  TicketQueueItem,
  FeedbackQueueItem,
  LogQueueItem,
  QueueStats,
  SyncStatus,
  QueueConfig,
  DEFAULT_QUEUE_CONFIG,
  QUEUE_ERROR_CODES
} from './types';

export class OfflineQueue {
  private db: EncryptedDatabase;
  private config: QueueConfig;
  private syncInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isSyncing = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.db = new EncryptedDatabase(this.config);
    this.startBackgroundTasks();
  }

  private startBackgroundTasks(): void {
    // Start sync interval
    this.syncInterval = setInterval(() => {
      this.attemptSync().catch(console.error);
    }, this.config.syncIntervalMs);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldItems().catch(console.error);
    }, this.config.cleanupIntervalMs);
  }

  private stopBackgroundTasks(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  public async enqueueTicket(ticketData: TicketQueueItem['ticketData'], destination: TicketQueueItem['destination']): Promise<string> {
    return this.enqueueItem({
      type: 'ticket',
      ticketData,
      destination
    } as TicketQueueItem);
  }

  public async enqueueFeedback(feedbackData: FeedbackQueueItem['feedbackData']): Promise<string> {
    return this.enqueueItem({
      type: 'feedback',
      feedbackData
    } as FeedbackQueueItem);
  }

  public async enqueueLog(logData: LogQueueItem['logData']): Promise<string> {
    return this.enqueueItem({
      type: 'log',
      logData
    } as LogQueueItem);
  }

  private async enqueueItem(item: Omit<QueueItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'retryCount'>): Promise<string> {
    const id = uuidv4();
    const now = Date.now();

    // Create the base queue item structure
    const baseItem = {
      id,
      createdAt: now,
      updatedAt: now,
      status: 'pending' as const,
      retryCount: 0,
      priority: item.priority || 'normal',
      nextRetryAt: undefined,
      lastError: undefined
    };

    // Merge with the specific item type
    const queueItem: QueueItem = { ...item, ...baseItem } as QueueItem;

    // Check size limits before enqueueing
    await this.checkSizeLimits(queueItem);

    const database = this.db.getDatabase();
    const encrypted = this.db.encryptData(queueItem);

    const sizeBytes = this.calculateItemSize(queueItem);

    const stmt = database.prepare(`
      INSERT INTO queue_items (
        id, type, status, priority, encrypted_data, encryption_iv, encryption_auth_tag,
        retry_count, created_at, updated_at, size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        queueItem.type,
        queueItem.status,
        queueItem.priority,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag,
        queueItem.retryCount,
        queueItem.createdAt,
        queueItem.updatedAt,
        sizeBytes
      );

      return id;
    } catch (error) {
      if ((error as Error).message.includes('SQLITE_FULL')) {
        await this.cleanupSpace(sizeBytes);
        return this.enqueueItem(item);
      }
      throw new Error(`${QUEUE_ERROR_CODES.DATABASE_ERROR}: ${(error as Error).message}`);
    }
  }

  private calculateItemSize(item: QueueItem): number {
    const json = JSON.stringify(item);
    return Buffer.byteLength(json, 'utf8');
  }

  private async checkSizeLimits(item: QueueItem): Promise<void> {
    const stats = await this.getStats();

    if (item.type === 'ticket' && stats.byType.ticket >= this.config.maxTicketItems) {
      throw new Error(QUEUE_ERROR_CODES.QUEUE_FULL);
    }

    if (item.type === 'feedback' && stats.byType.feedback >= this.config.maxFeedbackItems) {
      throw new Error(QUEUE_ERROR_CODES.QUEUE_FULL);
    }

    if (item.type === 'log' && stats.totalSizeBytes + this.calculateItemSize(item) > this.config.maxLogSizeBytes) {
      await this.cleanupLogSpace(this.calculateItemSize(item));
    }
  }

  public async getItem(id: string): Promise<QueueItem | null> {
    const database = this.db.getDatabase();
    const stmt = database.prepare(`
      SELECT encrypted_data, encryption_iv, encryption_auth_tag
      FROM queue_items WHERE id = ?
    `);

    const row = stmt.get(id) as { encrypted_data: string; encryption_iv: string; encryption_auth_tag: string } | undefined;

    if (!row) {
      return null;
    }

    return this.db.decryptData(row.encrypted_data, row.encryption_iv, row.encryption_auth_tag);
  }

  public async getPendingItems(limit?: number): Promise<QueueItem[]> {
    return this.getItemsByStatus('pending', limit);
  }

  public async getRetryingItems(limit?: number): Promise<QueueItem[]> {
    return this.getItemsByStatus('retrying', limit);
  }

  private async getItemsByStatus(status: QueueItem['status'], limit?: number): Promise<QueueItem[]> {
    const database = this.db.getDatabase();
    const query = limit
      ? `SELECT encrypted_data, encryption_iv, encryption_auth_tag FROM queue_items WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?`
      : `SELECT encrypted_data, encryption_iv, encryption_auth_tag FROM queue_items WHERE status = ? ORDER BY priority DESC, created_at ASC`;

    const stmt = database.prepare(query);
    const rows = limit ? stmt.all(status, limit) : stmt.all(status);

    const items: QueueItem[] = [];
    for (const row of rows as Array<{ encrypted_data: string; encryption_iv: string; encryption_auth_tag: string }>) {
      try {
        const item = this.db.decryptData(row.encrypted_data, row.encryption_iv, row.encryption_auth_tag);
        items.push(item);
      } catch (error) {
        console.error('Failed to decrypt item, skipping:', (error as Error).message);
        // Skip corrupted items
      }
    }
    return items;
  }

  public async updateItemStatus(id: string, status: QueueItem['status'], error?: string): Promise<void> {
    const database = this.db.getDatabase();
    const now = Date.now();

    const stmt = database.prepare(`
      UPDATE queue_items
      SET status = ?, updated_at = ?, last_error = ?, retry_count = retry_count + 1
      WHERE id = ?
    `);

    stmt.run(status, now, error, id);
  }

  public async scheduleRetry(id: string, error: string): Promise<void> {
    const database = this.db.getDatabase();
    const now = Date.now();

    const item = await this.getItem(id);
    if (!item) {
      throw new Error(QUEUE_ERROR_CODES.ITEM_NOT_FOUND);
    }

    if (item.retryCount >= this.config.maxRetryAttempts) {
      await this.updateItemStatus(id, 'failed', `Max retries exceeded: ${error}`);
      return;
    }

    const backoff = this.calculateBackoff(item.retryCount);
    const nextRetryAt = now + backoff;

    const stmt = database.prepare(`
      UPDATE queue_items
      SET status = 'retrying', updated_at = ?, next_retry_at = ?, last_error = ?, retry_count = retry_count + 1
      WHERE id = ?
    `);

    stmt.run(now, nextRetryAt, error, id);
  }

  private calculateBackoff(retryCount: number): number {
    const baseBackoff = this.config.retryBackoffMs;
    const jitter = Math.random() * this.config.retryJitterMs;
    return baseBackoff * Math.pow(2, retryCount) + jitter;
  }

  public async getStats(): Promise<QueueStats> {
    const database = this.db.getDatabase();

    const statusStats = database.prepare(`
      SELECT status, COUNT(*) as count
      FROM queue_items
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const typeStats = database.prepare(`
      SELECT type, COUNT(*) as count
      FROM queue_items
      GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    const priorityStats = database.prepare(`
      SELECT priority, COUNT(*) as count
      FROM queue_items
      GROUP BY priority
    `).all() as Array<{ priority: string; count: number }>;

    const sizeStats = database.prepare(`
      SELECT COALESCE(SUM(size_bytes), 0) as total_size
      FROM queue_items
    `).get() as { total_size: number };

    const oldestItem = database.prepare(`
      SELECT MIN(created_at) as oldest
      FROM queue_items
      WHERE status IN ('pending', 'retrying')
    `).get() as { oldest: number | null };

    return {
      totalItems: statusStats.reduce((sum, stat) => sum + stat.count, 0),
      pending: statusStats.find(s => s.status === 'pending')?.count || 0,
      processing: statusStats.find(s => s.status === 'processing')?.count || 0,
      completed: statusStats.find(s => s.status === 'completed')?.count || 0,
      failed: statusStats.find(s => s.status === 'failed')?.count || 0,
      retrying: statusStats.find(s => s.status === 'retrying')?.count || 0,
      byType: {
        ticket: typeStats.find(s => s.type === 'ticket')?.count || 0,
        feedback: typeStats.find(s => s.type === 'feedback')?.count || 0,
        log: typeStats.find(s => s.type === 'log')?.count || 0
      },
      byPriority: {
        low: priorityStats.find(s => s.priority === 'low')?.count || 0,
        normal: priorityStats.find(s => s.priority === 'normal')?.count || 0,
        high: priorityStats.find(s => s.priority === 'high')?.count || 0,
        critical: priorityStats.find(s => s.priority === 'critical')?.count || 0
      },
      oldestItemAge: oldestItem.oldest ? Date.now() - oldestItem.oldest : 0,
      totalSizeBytes: sizeStats.total_size
    };
  }

  public async cleanupOldItems(): Promise<void> {
    const database = this.db.getDatabase();

    // Remove completed items older than 7 days
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    database.prepare(`
      DELETE FROM queue_items
      WHERE status = 'completed' AND created_at < ?
    `).run(weekAgo);

    // Remove failed items older than 30 days
    const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    database.prepare(`
      DELETE FROM queue_items
      WHERE status = 'failed' AND created_at < ?
    `).run(monthAgo);
  }

  private async cleanupSpace(requiredSpace: number): Promise<void> {
    const stats = await this.getStats();

    if (stats.totalSizeBytes + requiredSpace > this.config.maxLogSizeBytes) {
      await this.cleanupLogSpace(requiredSpace);
    }
  }

  private async cleanupLogSpace(requiredSpace: number): Promise<void> {
    const database = this.db.getDatabase();

    // Delete oldest log items until we have enough space
    const stmt = database.prepare(`
      SELECT id, size_bytes
      FROM queue_items
      WHERE type = 'log'
      ORDER BY created_at ASC
    `);

    const logs = stmt.all() as Array<{ id: string; size_bytes: number }>;

    let spaceFreed = 0;
    for (const log of logs) {
      if (spaceFreed >= requiredSpace) {
        break;
      }

      database.prepare('DELETE FROM queue_items WHERE id = ?').run(log.id);
      spaceFreed += log.size_bytes;
    }
  }

  public async attemptSync(): Promise<SyncStatus> {
    if (this.isSyncing) {
      return this.getSyncStatus();
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      const pendingItems = await this.getPendingItems();
      const retryingItems = await this.getRetryingItems();
      const itemsToSync = [...pendingItems, ...retryingItems].filter(item =>
        !item.nextRetryAt || item.nextRetryAt <= Date.now()
      );

      let itemsSynced = 0;
      let itemsFailed = 0;
      let syncError: string | undefined;

      for (const item of itemsToSync) {
        try {
          await this.syncItem(item);
          await this.updateItemStatus(item.id, 'completed');
          itemsSynced++;
        } catch (error) {
          await this.scheduleRetry(item.id, (error as Error).message);
          itemsFailed++;
          syncError = (error as Error).message;
        }
      }

      const duration = Date.now() - startTime;
      await this.recordSyncHistory(duration, itemsSynced, itemsFailed, syncError);

      return {
        isOnline: itemsSynced > 0 || itemsToSync.length === 0,
        lastSyncTime: startTime,
        lastSyncDuration: duration,
        syncError: itemsFailed > 0 ? syncError : undefined,
        itemsSynced,
        itemsFailed,
        queueSize: itemsToSync.length
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.recordSyncHistory(duration, 0, 0, (error as Error).message);

      return {
        isOnline: false,
        lastSyncTime: startTime,
        lastSyncDuration: duration,
        syncError: (error as Error).message,
        itemsSynced: 0,
        itemsFailed: 0,
        queueSize: 0
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncItem(item: QueueItem): Promise<void> {
    // This is where you would implement actual sync logic
    // For now, we'll simulate network requests

    if (item.type === 'ticket') {
      await this.syncTicket(item);
    } else if (item.type === 'feedback') {
      await this.syncFeedback(item);
    } else if (item.type === 'log') {
      await this.syncLog(item);
    }
  }

  private async syncTicket(item: TicketQueueItem): Promise<void> {
    // Simulate API call to ServiceNow, Jira, etc.
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));

    // Simulate occasional failures
    if (Math.random() < 0.2) {
      throw new Error('Ticket sync failed: API timeout');
    }
  }

  private async syncFeedback(item: FeedbackQueueItem): Promise<void> {
    // Simulate API call to feedback service
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
  }

  private async syncLog(item: LogQueueItem): Promise<void> {
    // Simulate log ingestion service
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 80));
  }

  private async recordSyncHistory(
    durationMs: number,
    itemsSynced: number,
    itemsFailed: number,
    errorMessage?: string
  ): Promise<void> {
    const database = this.db.getDatabase();

    const stmt = database.prepare(`
      INSERT INTO sync_history (
        timestamp, duration_ms, items_synced, items_failed, error_message
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(Date.now(), durationMs, itemsSynced, itemsFailed, errorMessage);
  }

  public async getSyncStatus(): Promise<SyncStatus> {
    const database = this.db.getDatabase();

    const lastSync = database.prepare(`
      SELECT timestamp, duration_ms, items_synced, items_failed, error_message
      FROM sync_history
      ORDER BY timestamp DESC
      LIMIT 1
    `).get() as { timestamp: number; duration_ms: number; items_synced: number; items_failed: number; error_message: string } | undefined;

    const stats = await this.getStats();

    return {
      isOnline: !lastSync?.error_message || lastSync.items_synced > 0,
      lastSyncTime: lastSync?.timestamp,
      lastSyncDuration: lastSync?.duration_ms,
      syncError: lastSync?.error_message,
      itemsSynced: lastSync?.items_synced || 0,
      itemsFailed: lastSync?.items_failed || 0,
      queueSize: stats.pending + stats.retrying
    };
  }

  public async clearQueue(): Promise<void> {
    const database = this.db.getDatabase();
    database.prepare('DELETE FROM queue_items').run();
  }

  public async close(): Promise<void> {
    this.stopBackgroundTasks();
    this.db.close();
  }

  public async exportQueue(): Promise<QueueItem[]> {
    const database = this.db.getDatabase();
    const rows = database.prepare(`
      SELECT encrypted_data, encryption_iv, encryption_auth_tag
      FROM queue_items
      ORDER BY created_at ASC
    `).all() as Array<{ encrypted_data: string; encryption_iv: string; encryption_auth_tag: string }>;

    return rows.map(row => this.db.decryptData(row.encrypted_data, row.encryption_iv, row.encryption_auth_tag));
  }

  public async importQueue(items: QueueItem[]): Promise<void> {
    const database = this.db.getDatabase();

    for (const item of items) {
      const encrypted = this.db.encryptData(item);
      const sizeBytes = this.calculateItemSize(item);

      const stmt = database.prepare(`
        INSERT OR REPLACE INTO queue_items (
          id, type, status, priority, encrypted_data, encryption_iv, encryption_auth_tag,
          retry_count, next_retry_at, last_error, created_at, updated_at, size_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        item.id,
        item.type,
        item.status,
        item.priority,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag,
        item.retryCount,
        item.nextRetryAt,
        item.lastError,
        item.createdAt,
        item.updatedAt,
        sizeBytes
      );
    }
  }
}