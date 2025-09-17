import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import { OfflineQueue } from '../offline-queue/offline-queue';
import { LogManager } from '../skills-engine/logging/LogManager';
import { FeedbackQueueItem } from '../offline-queue/types';
import {
  FeedbackAnalyticsSummary,
  FeedbackInput,
  FeedbackQueueRecord,
  FeedbackRating
} from '../types/feedback';

export class FeedbackService {
  private records: FeedbackQueueRecord[] = [];
  private storagePath: string;

  constructor(
    private readonly queue: OfflineQueue,
    private readonly logManager: LogManager,
    storageDirectory?: string
  ) {
    const metricsDir = storageDirectory ?? path.join(app.getPath('userData'), 'analytics');
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }
    this.storagePath = path.join(metricsDir, 'feedback-records.json');
    this.loadRecords();
  }

  private loadRecords(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw) as FeedbackQueueRecord[];
        if (Array.isArray(parsed)) {
          this.records = parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load feedback records:', (error as Error).message);
      this.records = [];
    }
  }

  private persistRecords(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.records, null, 2), { encoding: 'utf-8' });
    } catch (error) {
      console.error('Failed to persist feedback records:', (error as Error).message);
    }
  }

  private sanitizeComment(comment?: string): string | undefined {
    if (!comment) return undefined;
    const trimmed = comment.trim().slice(0, 500);
    return trimmed.length ? trimmed : undefined;
  }

  async submitFeedback(input: FeedbackInput): Promise<FeedbackAnalyticsSummary> {
    if (input.rating !== 'up' && input.rating !== 'down') {
      throw new Error('Invalid feedback rating');
    }

    const record: FeedbackQueueRecord = {
      id: crypto.randomUUID(),
      rating: input.rating,
      comment: this.sanitizeComment(input.comment),
      skillId: input.skillId,
      sessionId: input.sessionId,
      resolved: input.resolved ?? false,
      executionTimeMs: input.executionTimeMs,
      createdAt: Date.now()
    };

    this.records.push(record);
    if (this.records.length > 1000) {
      this.records = this.records.slice(-1000);
    }
    this.persistRecords();

    const queuePayload: FeedbackQueueItem['feedbackData'] = {
      rating: input.rating === 'up' ? 1 : 0,
      comment: record.comment || '',
      userId: 'local-user',
      userName: 'Anonymous',
      skillId: input.skillId,
      context: {
        sessionId: input.sessionId,
        resolved: input.resolved ?? false,
        executionTimeMs: input.executionTimeMs,
        createdAt: record.createdAt
      }
    };

    await this.queue.enqueueFeedback(queuePayload);
    return this.getSummary();
  }

  getSummary(): FeedbackAnalyticsSummary {
    const total = this.records.length;
    const thumbsUp = this.records.filter((r) => r.rating === 'up').length;
    const thumbsDown = total - thumbsUp;
    const satisfaction = total === 0 ? 0 : (thumbsUp / total) * 100;

    const resolvedRecords = this.records.filter((r) => r.resolved && typeof r.executionTimeMs === 'number');
    const mttr = resolvedRecords.length
      ? resolvedRecords.reduce((sum, rec) => sum + (rec.executionTimeMs || 0), 0) / resolvedRecords.length
      : null;

    const performance = this.logManager.getPerformanceReport();
    const queueHealth = this.logManager.getQueueHealth();

    const resolutionRate = performance?.historical?.totalExecutions
      ? performance.historical.successfulExecutions / performance.historical.totalExecutions
      : 0;

    const averageResolutionTimeMs = performance?.historical?.averageExecutionTimeMs ?? 0;

    return {
      totalFeedback: total,
      thumbsUp,
      thumbsDown,
      satisfactionScore: parseFloat(satisfaction.toFixed(1)),
      mttrMs: mttr !== null ? Math.round(mttr) : null,
      resolutionRate: parseFloat((resolutionRate * 100).toFixed(1)),
      averageResolutionTimeMs,
      queueBacklog: queueHealth
        ? {
            pending: queueHealth.pending,
            failed: queueHealth.failed,
            retrying: queueHealth.retrying,
            oldestMinutes: Math.round(queueHealth.oldestItemAge / 60000)
          }
        : null,
      updatedAt: new Date().toISOString()
    };
  }

  exportCsv(): string {
    const header = 'Timestamp,Rating,Skill,Session,Resolved,ExecutionTimeMs,Comment\n';
    const rows = this.records.map((record) => {
      const safeComment = (record.comment || '').replace(/"/g, '""');
      return [
        new Date(record.createdAt).toISOString(),
        record.rating,
        record.skillId || '',
        record.sessionId || '',
        record.resolved,
        record.executionTimeMs ?? '',
        `"${safeComment}"`
      ].join(',');
    });

    return header + rows.join('\n');
  }
}
