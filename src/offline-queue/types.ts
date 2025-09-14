// Offline Queue System Types and Interfaces

export interface QueueItemBase {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  retryCount: number;
  nextRetryAt?: number;
  lastError?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

export interface TicketQueueItem extends QueueItemBase {
  type: 'ticket';
  ticketData: {
    summary: string;
    description: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    user: {
      id: string;
      name: string;
      email?: string;
    };
    systemInfo: {
      osVersion: string;
      architecture: string;
      deviceName: string;
    };
    skillResults: Array<{
      skillId: string;
      status: 'success' | 'error' | 'timeout';
      output?: string;
      executionTimeMs: number;
    }>;
    attachments?: Array<{
      name: string;
      type: string;
      size: number;
      content: string; // base64 encoded
    }>;
  };
  destination: {
    type: 'servicenow' | 'jira' | 'zendesk' | 'salesforce';
    config: Record<string, any>;
  };
}

export interface FeedbackQueueItem extends QueueItemBase {
  type: 'feedback';
  feedbackData: {
    rating: number;
    comment: string;
    userId: string;
    userName: string;
    skillId?: string;
    context: Record<string, any>;
  };
}

export interface LogQueueItem extends QueueItemBase {
  type: 'log';
  logData: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    message: string;
    timestamp: number;
    component: string;
    skillId?: string;
    executionId?: string;
    correlationId?: string;
    context?: Record<string, any>;
    error?: {
      message: string;
      stack?: string;
      code?: string;
    };
  };
}

export type QueueItem = TicketQueueItem | FeedbackQueueItem | LogQueueItem;

export interface QueueStats {
  totalItems: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  byType: {
    ticket: number;
    feedback: number;
    log: number;
  };
  byPriority: {
    low: number;
    normal: number;
    high: number;
    critical: number;
  };
  oldestItemAge: number;
  totalSizeBytes: number;
}

export interface QueueConfig {
  maxTicketItems: number;
  maxFeedbackItems: number;
  maxLogSizeBytes: number;
  maxRetryAttempts: number;
  retryBackoffMs: number;
  retryJitterMs: number;
  cleanupIntervalMs: number;
  syncIntervalMs: number;
  encryptionKey: string;
  databasePath: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime?: number;
  lastSyncDuration?: number;
  syncError?: string;
  itemsSynced: number;
  itemsFailed: number;
  queueSize: number;
  connectionType?: 'wifi' | 'ethernet' | 'cellular' | 'unknown';
  bandwidth?: number;
}

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface DatabaseMigration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxTicketItems: 20,
  maxFeedbackItems: 100,
  maxLogSizeBytes: 50 * 1024 * 1024, // 50MB
  maxRetryAttempts: 5,
  retryBackoffMs: 30000, // 30 seconds
  retryJitterMs: 5000,   // 5 seconds jitter
  cleanupIntervalMs: 3600000, // 1 hour
  syncIntervalMs: 30000, // 30 seconds
  encryptionKey: process.env.OFFLINE_QUEUE_ENCRYPTION_KEY || 'default-insecure-key-change-in-production',
  databasePath: process.env.OFFLINE_QUEUE_DB_PATH || './data/offline-queue.db'
};

export const QUEUE_ERROR_CODES = {
  DATABASE_ERROR: 'QUEUE_DATABASE_ERROR',
  ENCRYPTION_ERROR: 'QUEUE_ENCRYPTION_ERROR',
  DECRYPTION_ERROR: 'QUEUE_DECRYPTION_ERROR',
  QUEUE_FULL: 'QUEUE_FULL',
  ITEM_NOT_FOUND: 'QUEUE_ITEM_NOT_FOUND',
  INVALID_ITEM: 'QUEUE_INVALID_ITEM',
  MAX_RETRIES_EXCEEDED: 'QUEUE_MAX_RETRIES_EXCEEDED',
  SYNC_FAILED: 'QUEUE_SYNC_FAILED',
  CONNECTION_ERROR: 'QUEUE_CONNECTION_ERROR'
} as const;