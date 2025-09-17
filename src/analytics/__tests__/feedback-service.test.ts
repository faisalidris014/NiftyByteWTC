import { FeedbackService } from '../FeedbackService';
import type { FeedbackInput } from '../../types/feedback';
import type { OfflineQueue } from '../../offline-queue/offline-queue';
import type { LogManager } from '../../skills-engine/logging/LogManager';
import * as path from 'path';
import * as fs from 'fs';

describe('FeedbackService', () => {
  const tempDir = path.join(__dirname, '__temp__');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  const createService = () => {
    const queue: Partial<OfflineQueue> = {
      enqueueFeedback: jest.fn().mockResolvedValue('feedback-id')
    };

    const logManager: Partial<LogManager> = {
      getPerformanceReport: jest.fn(() => ({
        historical: {
          totalExecutions: 10,
          successfulExecutions: 8,
          failedExecutions: 2,
          averageExecutionTimeMs: 1200,
          p95ExecutionTimeMs: 1500,
          p99ExecutionTimeMs: 2000,
          totalSecurityEvents: 0,
          highSeverityEvents: 0,
          resourceUsage: {
            maxCpuPercentage: 0,
            maxMemoryBytes: 0,
            maxDiskWriteBytes: 0,
            maxNetworkBytes: 0
          },
          skillStats: {},
          errorDistribution: {},
          period: { start: Date.now(), end: Date.now() }
        },
        realTime: {
          activeExecutions: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          recentErrors: 0
        },
        alerts: [],
        endpointHealth: [],
        queueHealth: {
          totalItems: 0,
          pending: 0,
          failed: 0,
          retrying: 0,
          oldestItemAge: 0,
          totalSizeBytes: 0
        }
      })),
      getQueueHealth: jest.fn(() => ({
        totalItems: 5,
        pending: 2,
        failed: 1,
        retrying: 1,
        oldestItemAge: 60000,
        totalSizeBytes: 2048
      }))
    };

    return new FeedbackService(queue as OfflineQueue, logManager as LogManager, tempDir);
  };

  it('records feedback submissions and updates summary', async () => {
    const service = createService();
    const payload: FeedbackInput = {
      rating: 'up',
      comment: 'Great help',
      resolved: true,
      executionTimeMs: 900
    };

    const summary = await service.submitFeedback(payload);
    expect(summary.totalFeedback).toBe(1);
    expect(summary.thumbsUp).toBe(1);
    expect(summary.satisfactionScore).toBe(100);
    expect(summary.mttrMs).toBe(900);
  });

  it('sanitizes comments and exports csv', async () => {
    const service = createService();
    await service.submitFeedback({ rating: 'down', comment: ' needs improvement   ' });
    const csv = service.exportCsv();
    expect(csv).toContain('needs improvement');
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });
});
