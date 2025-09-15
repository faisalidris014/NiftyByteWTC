import { PerformanceMetrics, MonitoringStats, AuditLogEntry, DashboardMetrics } from './types';
import { Logger } from './Logger';
import * as os from 'os';
import * as process from 'process';

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

  private alerts: DashboardMetrics['alerts'] = [];
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(private logger: Logger) {
    this.startMonitoring();
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

    // Reset stats every hour
    setInterval(() => {
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
      this.addAlert('critical', `High severity security event: ${details}`, executionId);
    }
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

  addAlert(level: 'info' | 'warning' | 'critical', message: string, context?: string): void {
    const alert = {
      id: Math.random().toString(36).substr(2, 9),
      level,
      message,
      timestamp: Date.now(),
      acknowledged: false,
      context
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    this.logger[level === 'critical' ? 'error' : level](
      `Alert: ${message}`,
      undefined,
      { alertId: alert.id, context },
      { component: 'alerts' }
    );
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
      alerts: [...this.alerts]
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

    // Save final statistics
    this.logger.info('Monitoring system shutdown', {
      finalStats: this.stats,
      activeExecutions: this.metrics.size
    });
  }
}