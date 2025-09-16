# Monitoring & Alerting Overview

## Capabilities Added

- **Endpoint health tracking** with heartbeat statuses (`healthy`, `degraded`, `unhealthy`, `offline`).
- **Offline queue telemetry** streamed from the queue facade to the monitoring system for backlog detection.
- **Alert evaluation engine** with configurable rules, cooldowns, and severities.
- **Notification dispatch** via simulated email/webhook channels ready for integration with SMTP or chat systems.
- **Performance metrics correlation** using existing execution statistics and resilience data.

## Default Alert Rules

| Rule ID | Severity | Condition |
| --- | --- | --- |
| `skill-failure-spike` | Warning | ≥5 executions with failure rate ≥30% over the current window. |
| `endpoint-unhealthy` | Critical | Any endpoint reports `unhealthy` or `offline`. |
| `queue-backlog` | Warning/Critical | Queue pending ≥10 or items older than 30 minutes (critical when failures >0). |

Rules are extensible via `LogManager.configureAlerting({ rules })`.

## Notification Channels

Notifications are routed through `NotificationManager` and logged for audit. Configure channels at runtime:

```ts
logManager.configureAlerting({
  channels: [
    { id: 'ops-email', type: 'email', enabled: true, target: 'ops@example.com', minSeverity: 'warning' },
    { id: 'slack-alerts', type: 'slack', enabled: true, target: 'https://hooks.slack.com/services/...', minSeverity: 'critical' }
  ]
});
```

The implementation logs payloads for now, making it safe for offline development; production teams can plug in real transport providers.

## Queue Monitoring Integration

`OfflineQueue` now exposes `setMonitoringCallback`, streaming queue statistics back to the monitoring subsystem each time items are enqueued, retried, synced, or purged. The monitoring system evaluates alerts and publishes backlog telemetry through the dashboard.

## Health APIs

- `LogManager.updateEndpointHealth(status)` – update status from tray agents or orchestrators.
- `LogManager.markEndpointOffline(id)` – mark endpoints as offline after heartbeat timeout.
- `LogManager.updateQueueHealth(stats)` – push queue stats from external schedulers (handled automatically by `OfflineQueue`).

## Dashboards

`MonitoringDashboard` exposes:

- Real-time resource usage and error counts.
- Historical success rates and security event counts.
- Active alerts with acknowledgement support.
- Endpoint health summaries and queue backlog snapshots.

Use `dashboard.formatMetricsForDisplay()` for UI-friendly structures.

## Testing

Automated tests cover:

- Alert rule triggers for failure spikes, endpoint health, and queue backlog (`monitoring-system.test.ts`).
- Packaging configuration checks for update channels and rollback artifacts (`packaging-config.test.ts`).
- MVP skills metadata and script validation (`mvp-skills-acceptance.test.ts`).

Run via:

```bash
npm test -- monitoring-system.test.ts
npm test -- packaging-config.test.ts
npm test -- mvp-skills-acceptance.test.ts
```

These tests should be added to CI to ensure observability regressions are caught early.
