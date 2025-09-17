# Feedback & Analytics System

## Overview
The feedback analytics pipeline captures end-user sentiment (thumbs up/down), tracks time-to-resolution metrics, and surfaces operational insights inside the Admin Console.

## Data Flow
1. **Tray UI** – End user submits thumbs up/down rating plus optional comment.
2. **Preload IPC** – Renderer sends sanitized payload through `feedback:submit` channel.
3. **Main Process** – `FeedbackService` queues the feedback for synchronization, updates local analytics ledger, and returns refreshed summary data.
4. **Admin Console** – Analytics tab displays satisfaction scores, resolution rates, MTTR, and offline queue health. CSV exports are available for downstream BI tools.

## Feedback Payload
```ts
interface FeedbackInput {
  rating: 'up' | 'down';
  comment?: string;          // Trimmed, max 500 chars
  skillId?: string;          // Optional troubleshooting skill context
  sessionId?: string;        // Unique conversation/session identifier
  resolved?: boolean;        // Indicates whether the issue was resolved
  executionTimeMs?: number;  // Time taken to reach resolution
}
```

## Analytics Summary Fields
- `totalFeedback` – Number of ratings captured (bounded at 1,000 most recent).
- `satisfactionScore` – Percentage of positive feedback.
- `resolutionRate` – Share of successful skill executions (from monitoring data).
- `mttrMs` – Mean time to resolution, derived from feedback marked `resolved`.
- `queueBacklog` – Snapshot of offline queue backlog and retry counts.

## Notifications & Reporting
- `LogManager.configureAlerting()` supports future integrations with email/Slack/Teams.
- CSV export (`feedback:export`) produces Excel-friendly datasets for audit/compliance.

## Security Guardrails
- Comments are trimmed and capped at 500 characters to prevent log flooding/xss.
- Feedback records are persisted under `%APPDATA%/analytics/feedback-records.json` with bounded history.
- Offline queue leverages existing AES-256 encryption for queued feedback items.

## Testing
Automated coverage lives in `src/analytics/__tests__/feedback-service.test.ts` alongside UI-level tests in existing suites. Run the analytics pipeline tests via:

```bash
npm test -- feedback-service.test.ts
npm test -- monitoring-system.test.ts
```

These should execute alongside the rest of the jest suites in CI.
