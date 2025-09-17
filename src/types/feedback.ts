export type FeedbackRating = 'up' | 'down';

export interface FeedbackInput {
  rating: FeedbackRating;
  comment?: string;
  skillId?: string;
  sessionId?: string;
  resolved?: boolean;
  executionTimeMs?: number;
}

export interface FeedbackQueueRecord {
  id: string;
  rating: FeedbackRating;
  comment?: string;
  skillId?: string;
  sessionId?: string;
  resolved: boolean;
  executionTimeMs?: number;
  createdAt: number;
}

export interface FeedbackAnalyticsSummary {
  totalFeedback: number;
  thumbsUp: number;
  thumbsDown: number;
  satisfactionScore: number;
  mttrMs: number | null;
  resolutionRate: number;
  averageResolutionTimeMs: number;
  queueBacklog?: {
    pending: number;
    failed: number;
    retrying: number;
    oldestMinutes: number;
  } | null;
  updatedAt: string;
}
