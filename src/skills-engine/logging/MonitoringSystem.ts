import {
  PerformanceMetrics,
  MonitoringStats,
  AuditLogEntry,
  DashboardMetrics,
  AlertRule,
  AlertEvaluationContext,
  EndpointHealthStatus,
  QueueHealthStatus,
  NotificationChannelConfig,
  DashboardAlert,
  AlertViolation
} from './types';
import { Logger } from './Logger';
import { AlertManager } from './AlertManager';
import * as os from 'os';
import * as process from 'process';

const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'skill-failure-spike',
    description: 'High failure rate detected for troubleshooting skills',
    severity: 'warning',
    cooldownMinutes: 5,
    evaluate: ({ monitoringStats }): AlertViolation | null => {
      const { totalExecutions, failedExecutions } = monitoringStats;
      if (totalExecutions < 5) return null;
      const failureRate = failedExecutions / totalExecutions;
      if (failedExecutions >= 5 && failureRate >= 0.3) {
        return {
          ruleId: 'skill-failure-spike',
          severity: 'warning' as const,
          message: `Skill failure rate elevated at ${(failureRate * 100).toFixed(1)}% (${failedExecutions}/${totalExecutions}).`,
          timestamp: Date.now(),
          details: { failedExecutions, totalExecutions, failureRate }
        };
      }
      return null;
    }
  },
  {
    id: 'endpoint-unhealthy',
    description: 'One or more endpoints reporting unhealthy status',
    severity: 'critical',
    cooldownMinutes: 10,
    evaluate: ({ endpointHealth }): AlertViolation | null => {
      const unhealthy = endpointHealth.filter((endpoint) => endpoint.status === 'unhealthy' || endpoint.status === 'offline');
      if (!unhealthy.length) return null;
      return {
        ruleId: 'endpoint-unhealthy',
        severity: 'critical' as const,
        message: `${unhealthy.length} endpoint(s) reporting unhealthy or offline status.`,
        timestamp: Date.now(),
        details: { endpoints: unhealthy }
      };
    }
  },
  {
    id: 'queue-backlog',
    description: 'Offline queue backlog detected',
    severity: 'warning',
    cooldownMinutes: 5,
    evaluate: ({ queueHealth }): AlertViolation | null => {
      if (!queueHealth) return null;
      const { pending, failed, oldestItemAge } = queueHealth;
      const oldestMinutes = oldestItemAge / (60 * 1000);
      if (pending >= 10 || failed > 0 || oldestMinutes > 30) {
        return {
          ruleId: 'queue-backlog',
          severity: failed > 0 ? 'critical' : 'warning',
          message: `Offline queue backlog detected (pending: ${pending}, failed: ${failed}, oldest: ${Math.round(oldestMinutes)}m).`,
          timestamp: Date.now(),
          details: queueHealth
        };
      }
      return null;
    }
  }
];

export class MonitoringSystem {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private stats: MonitoringStats = this.createEmptyStats();
  private auditLog: AuditLogEntry[] = [];
  private realTimeMetrics: DashboardMetrics['realTime'] = {
    activeExecutions: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    recentErrors: 0
  };

  private alerts: DashboardAlert[] = [];
  private updateInterval: NodeJS.Timeout | null = null;
  private statsResetInterval: NodeJS.Timeout | null = null;
  private alertManager: AlertManager;
  private endpointHealth: Map<string, EndpointHealthStatus> = new Map();
  private queueHealth?: QueueHealthStatus;

  private notificationChannels: NotificationChannelConfig[] = [];

  constructor(private logger: Logger) {
    this.alertManager = new AlertManager(logger);
    this.alertManager.setRules(DEFAULT_ALERT_RULES);
    this.startMonitoring();
  }

  configureAlerting(options: {
    rules?: AlertRule[];
    channels?: NotificationChannelConfig[];
  }): void {
    if (options.rules) {
      this.alertManager.setRules(options.rules);
    }
    if (options.channels) {
      this.notificationChannels = options.channels;
      this.alertManager.configureNotifications(options.channels);
    }
  }

  private createEmptyStats(): MonitoringStats {
    const now = Date.now();
    return {
      period: { start: now, end: now },
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTimeMs: 0,
      p95ExecutionTimeMs: 0,
      p99ExecutionTimeMs: 0,
      totalSecurityEvents: 0,
      highSeverityEvents: 0,
      resourceUsage: {
        maxCpuPercentage: 0,
        maxMemoryBytes: 0,
        maxDiskWriteBytes: 0,
        maxNetworkBytes: 0
      },
      skillStats: {},
      errorDistribution: {}
    };
  }

  private startMonitoring(): void {
    // Update real-time metrics every second
    this.updateInterval = setInterval(() => {
      this.updateRealTimeMetrics();
    }, 1000);

    this.statsResetInterval = setInterval(() => {
      this.resetHourlyStats();
    }, 60 * 60 * 1000);
  }

  private updateRealTimeMetrics(): void {
    this.realTimeMetrics = {
      activeExecutions: this.metrics.size,
      cpuUsage: this.getCurrentCpuUsage(),
      memoryUsage: this.getCurrentMemoryUsage(),
      recentErrors: this.getRecentErrorCount()
    };
  }

  private getCurrentCpuUsage(): number {
    // Simplified CPU usage calculation
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return ((totalTick - totalIdle) / totalTick) * 100;
  }

  private getCurrentMemoryUsage(): number {
    return (os.totalmem() - os.freemem()) / os.totalmem() * 100;
  }

  private getRecentErrorCount(): number {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.auditLog.filter(entry =>
      entry.timestamp >= fiveMinutesAgo &&
      entry.status === 'failure'
    ).length;
  }

  startExecution(executionId: string, skillId: string): void {
    const metrics: PerformanceMetrics = {
      executionId,
      skillId,
      startTime: Date.now(),
      endTime: 0,
      durationMs: 0,
      cpuUsage: { average: 0, peak: 0, total: 0 },
      memoryUsage: { averageBytes: 0, peakBytes: 0, totalBytes: 0 },
      diskUsage: { readBytes: 0, writeBytes: 0, operations: 0 },
      networkUsage: { sentBytes: 0, receivedBytes: 0, connections: 0 },
      securityEvents: 0,
      success: false
    };

    this.metrics.set(executionId, metrics);

    this.logger.info('Execution started', {
      executionId,
      skillId,
      startTime: metrics.startTime
    }, { component: 'monitoring', executionId, skillId });
  }

  updateEndpointHealth(status: EndpointHealthStatus): void {
    this.endpointHealth.set(status.endpointId, { ...status, lastHeartbeat: Date.now() });
    this.logger.info('Endpoint health updated', {
      endpointId: status.endpointId,
      status: status.status,
      details: status.details
    }, { component: 'monitoring' });

    this.evaluateAlerts();
  }

  markEndpointOffline(endpointId: string, reason?: string): void {
    const existing = this.endpointHealth.get(endpointId);
    if (!existing) {
      this.endpointHealth.set(endpointId, {
        endpointId,
        name: endpointId,
        status: 'offline',
        lastHeartbeat: Date.now(),
        details: reason
      });
    } else {
      existing.status = 'offline';
      existing.details = reason;
      existing.lastHeartbeat = Date.now();
      this.endpointHealth.set(endpointId, existing);
    }
    this.logger.warn('Endpoint marked offline', { endpointId, reason }, { component: 'monitoring' });
    this.evaluateAlerts();
  }

  updateQueueHealth(stats: QueueHealthStatus): void {
    this.queueHealth = stats;
    this.logger.debug('Offline queue metrics updated', stats, { component: 'monitoring' });
    this.evaluateAlerts();
  }

  updateExecutionMetrics(
    executionId: string,
    updates: Partial<PerformanceMetrics>
  ): void {
    const metrics = this.metrics.get(executionId);
    if (metrics) {
      Object.assign(metrics, updates);
      this.metrics.set(executionId, metrics);
    }
  }

  endExecution(executionId: string, success: boolean, error?: { code: string; message: string }): void {
    const metrics = this.metrics.get(executionId);
    if (!metrics) return;

    metrics.endTime = Date.now();
    metrics.durationMs = metrics.endTime - metrics.startTime;
    metrics.success = success;

    if (error) {
      metrics.errorCode = error.code;
      metrics.errorMessage = error.message;
    }

    this.updateStatistics(metrics);
    this.metrics.delete(executionId);

    this.logger.info('Execution completed', {
      executionId,
      skillId: metrics.skillId,
      success,
      durationMs: metrics.durationMs,
      error
    }, { component: 'monitoring', executionId, skillId: metrics.skillId });

    this.evaluateAlerts();
  }

  private updateStatistics(metrics: PerformanceMetrics): void {
    this.stats.totalExecutions++;

    if (metrics.success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }

    // Update execution time statistics
    const totalTime = this.stats.averageExecutionTimeMs * (this.stats.totalExecutions - 1);
    this.stats.averageExecutionTimeMs = (totalTime + metrics.durationMs) / this.stats.totalExecutions;

    // Update resource usage maxima
    this.stats.resourceUsage.maxCpuPercentage = Math.max(
      this.stats.resourceUsage.maxCpuPercentage,
      metrics.cpuUsage.peak
    );
    this.stats.resourceUsage.maxMemoryBytes = Math.max(
      this.stats.resourceUsage.maxMemoryBytes,
      metrics.memoryUsage.peakBytes
    );
    this.stats.resourceUsage.maxDiskWriteBytes = Math.max(
      this.stats.resourceUsage.maxDiskWriteBytes,
      metrics.diskUsage.writeBytes
    );
    this.stats.resourceUsage.maxNetworkBytes = Math.max(
      this.stats.resourceUsage.maxNetworkBytes,
      metrics.networkUsage.sentBytes + metrics.networkUsage.receivedBytes
    );

    // Update skill-specific statistics
    if (!this.stats.skillStats[metrics.skillId]) {
      this.stats.skillStats[metrics.skillId] = {
        executions: 0,
        successes: 0,
        failures: 0,
        avgTimeMs: 0,
        securityEvents: 0
      };
    }

    const skillStats = this.stats.skillStats[metrics.skillId];
    skillStats.executions++;

    if (metrics.success) {
      skillStats.successes++;
    } else {
      skillStats.failures++;
    }

    const totalSkillTime = skillStats.avgTimeMs * (skillStats.executions - 1);
    skillStats.avgTimeMs = (totalSkillTime + metrics.durationMs) / skillStats.executions;

    // Update error distribution
    if (metrics.errorCode) {
      this.stats.errorDistribution[metrics.errorCode] =
        (this.stats.errorDistribution[metrics.errorCode] || 0) + 1;
    }

    this.stats.period.end = Date.now();
  }

  recordSecurityEvent(executionId: string, severity: 'low' | 'medium' | 'high', details: string): void {
    const metrics = this.metrics.get(executionId);
    if (metrics) {
      metrics.securityEvents++;
    }

    this.stats.totalSecurityEvents++;
    if (severity === 'high') {
      this.stats.highSeverityEvents++;
    }

    if (metrics) {
      const skillStats = this.stats.skillStats[metrics.skillId];
      if (skillStats) {
        skillStats.securityEvents++;
      }
    }

    this.logger.warn('Security event recorded', {
      executionId,
      severity,
      details,
      totalEvents: this.stats.totalSecurityEvents
    }, { component: 'security', executionId });

    // Generate alert for high severity events
    if (severity === 'high') {
      this.addManualAlert('critical', `High severity security event: ${details}`, {
        executionId,
        severity
      });
    }

    this.evaluateAlerts();
  }

  recordAuditEvent(entry: AuditLogEntry): void {
    this.auditLog.push(entry);

    // Keep only last 10,000 audit entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    this.logger.audit('Audit event recorded', {
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      status: entry.status,
      details: entry.details
    }, {
      component: 'audit',
      userId: entry.userId,
      correlationId: entry.correlationId
    });
  }

  private addManualAlert(level: 'info' | 'warning' | 'critical', message: string, details?: Record<string, any>): void {
    const alert: DashboardAlert = {
      id: Math.random().toString(36).slice(2, 11),
      severity: level,
      message,
      timestamp: Date.now(),
      acknowledged: false,
      details
    };

    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    if (level === 'critical') {
      this.logger.error(`Alert: ${message}`);
    } else if (level === 'warning') {
      this.logger.warn(`Alert: ${message}`);
    } else {
      this.logger.info(`Alert: ${message}`);
    }
  }

  private evaluateAlerts(): void {
    const context: AlertEvaluationContext = {
      monitoringStats: this.stats,
      endpointHealth: Array.from(this.endpointHealth.values()),
      queueHealth: this.queueHealth,
      lastAlerts: this.alertManager.getActiveAlerts()
    };

    const violations = this.alertManager.evaluate(context);

    if (violations.length) {
      for (const violation of violations) {
        const alert: DashboardAlert = {
          id: violation.ruleId,
          severity: violation.severity,
          message: violation.message,
          timestamp: violation.timestamp,
          acknowledged: false,
          details: violation.details
        };

        this.alerts = this.alerts.filter((existing) => existing.id !== alert.id);
        this.alerts.push(alert);
      }
    }

    const activeAlerts = this.alertManager.getActiveAlerts();
    const merged = new Map<string, DashboardAlert>();
    for (const alert of this.alerts) {
      merged.set(alert.id, alert);
    }
    for (const active of activeAlerts) {
      const existing = merged.get(active.ruleId);
      if (existing) {
        existing.timestamp = active.timestamp;
        existing.details = active.details;
      } else {
        merged.set(active.ruleId, {
          id: active.ruleId,
          severity: active.severity,
          message: active.message,
          timestamp: active.timestamp,
          acknowledged: false,
          details: active.details
        });
      }
    }

    this.alerts = Array.from(merged.values()).slice(-100);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  getDashboardMetrics(): DashboardMetrics {
    return {
      realTime: { ...this.realTimeMetrics },
      historical: { ...this.stats },
      alerts: [...this.alerts],
      endpointHealth: Array.from(this.endpointHealth.values()),
      queueHealth: this.queueHealth
    };
  }

  getExecutionMetrics(executionId: string): PerformanceMetrics | undefined {
    return this.metrics.get(executionId);
  }

  getAllMetrics(): PerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  getAuditLog(filter?: Partial<AuditLogEntry>): AuditLogEntry[] {
    if (!filter) return [...this.auditLog];

    return this.auditLog.filter(entry =>
      Object.entries(filter).every(([key, value]) =>
        entry[key as keyof AuditLogEntry] === value
      )
    );
  }

  private resetHourlyStats(): void {
    this.stats = this.createEmptyStats();
    this.logger.info('Hourly statistics reset');
  }

  async shutdown(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.statsResetInterval) {
      clearInterval(this.statsResetInterval);
      this.statsResetInterval = null;
    }

    // Save final statistics
    this.logger.info('Monitoring system shutdown', {
      finalStats: this.stats,
      activeExecutions: this.metrics.size
    });
  }
}
