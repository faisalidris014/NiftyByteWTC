import { MonitoringSystem } from './MonitoringSystem';
import { LogManager } from './LogManager';
import { DashboardMetrics, SearchCriteria, SearchResult } from './types';

export class MonitoringDashboard {
  private monitoringSystem: MonitoringSystem;
  private logManager: LogManager;
  private updateInterval: NodeJS.Timeout | null = null;
  private subscribers: Array<(metrics: DashboardMetrics) => void> = [];

  constructor() {
    this.logManager = LogManager.getInstance();
    this.monitoringSystem = new MonitoringSystem(this.logManager.getLogger());
  }

  // Real-time monitoring
  startRealTimeUpdates(intervalMs: number = 1000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      const metrics = this.getCurrentMetrics();
      this.notifySubscribers(metrics);
    }, intervalMs);

    this.logManager.info('Real-time monitoring started', { intervalMs });
  }

  stopRealTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.logManager.info('Real-time monitoring stopped');
  }

  subscribe(callback: (metrics: DashboardMetrics) => void): () => void {
    this.subscribers.push(callback);

    // Send current metrics immediately
    callback(this.getCurrentMetrics());

    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  private notifySubscribers(metrics: DashboardMetrics): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(metrics);
      } catch (error) {
        this.logManager.error('Subscriber callback failed', error as Error);
      }
    }
  }

  // Metrics access
  getCurrentMetrics(): DashboardMetrics {
    return this.monitoringSystem.getDashboardMetrics();
  }

  getExecutionMetrics(executionId: string) {
    return this.monitoringSystem.getExecutionMetrics(executionId);
  }

  getAllActiveExecutions() {
    return this.monitoringSystem.getAllMetrics();
  }

  // Alert management
  getAlerts() {
    return this.getCurrentMetrics().alerts;
  }

  acknowledgeAlert(alertId: string): void {
    this.monitoringSystem.acknowledgeAlert(alertId);
    this.logManager.info('Alert acknowledged', { alertId });
  }

  // Search and filtering
  async searchLogs(criteria: SearchCriteria): Promise<SearchResult> {
    return this.logManager.search(criteria);
  }

  async searchByExecutionId(executionId: string, limit: number = 50): Promise<SearchResult> {
    return this.logManager.search({
      filters: {
        executionId,
        // Add other required properties to satisfy LogFilter
        level: 'info'
      } as any,
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc'
    });
  }

  async searchErrors(limit: number = 20): Promise<SearchResult> {
    return this.logManager.search({
      filters: { level: 'error' },
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc'
    });
  }

  // Performance reports
  getPerformanceReport(skillId?: string) {
    return this.logManager.getPerformanceReport(skillId);
  }

  getErrorAnalysis() {
    return this.logManager.getErrorAnalysis();
  }

  getSecurityReport() {
    return this.logManager.getSecurityReport();
  }

  // Historical data
  getHistoricalStats() {
    return this.getCurrentMetrics().historical;
  }

  getSkillStatistics(skillId: string) {
    const stats = this.getHistoricalStats();
    return stats.skillStats[skillId] || {
      executions: 0,
      successes: 0,
      failures: 0,
      avgTimeMs: 0,
      securityEvents: 0
    };
  }

  // System health
  async getSystemHealth() {
    return this.logManager.healthCheck();
  }

  // Export functionality
  async exportReport(format: 'json' | 'csv' = 'json') {
    const metrics = this.getCurrentMetrics();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    let content: string;
    let filename: string;

    if (format === 'json') {
      content = JSON.stringify(metrics, null, 2);
      filename = `dashboard-report-${timestamp}.json`;
    } else {
      // Basic CSV conversion
      const csvLines = [
        'Metric,Value',
        `Total Executions,${metrics.historical.totalExecutions}`,
        `Successful Executions,${metrics.historical.successfulExecutions}`,
        `Failed Executions,${metrics.historical.failedExecutions}`,
        `Average Execution Time,${metrics.historical.averageExecutionTimeMs}`,
        `Security Events,${metrics.historical.totalSecurityEvents}`,
        `High Severity Events,${metrics.historical.highSeverityEvents}`,
        `Active Executions,${metrics.realTime.activeExecutions}`,
        `CPU Usage,${metrics.realTime.cpuUsage}`,
        `Memory Usage,${metrics.realTime.memoryUsage}`,
        `Recent Errors,${metrics.realTime.recentErrors}`
      ];

      content = csvLines.join('\n');
      filename = `dashboard-report-${timestamp}.csv`;
    }

    this.logManager.info('Dashboard report exported', { format, filename });

    return { filename, content };
  }

  // Maintenance operations
  async cleanupData(retentionDays: number = 30) {
    await this.logManager.cleanupOldLogs(retentionDays);
    this.logManager.info('Data cleanup completed', { retentionDays });
  }

  async rotateLogs() {
    await this.logManager.rotateLogs();
    this.logManager.info('Log rotation completed');
  }

  // Shutdown
  async shutdown() {
    this.stopRealTimeUpdates();
    await this.monitoringSystem.shutdown();
    this.logManager.info('Monitoring dashboard shutdown');
  }

  // Utility methods for UI integration
  formatMetricsForDisplay(metrics: DashboardMetrics) {
    return {
      realTime: {
        activeExecutions: metrics.realTime.activeExecutions,
        cpuUsage: `${metrics.realTime.cpuUsage.toFixed(1)}%`,
        memoryUsage: `${metrics.realTime.memoryUsage.toFixed(1)}%`,
        recentErrors: metrics.realTime.recentErrors
      },
      historical: {
        totalExecutions: metrics.historical.totalExecutions,
        successRate: metrics.historical.totalExecutions > 0
          ? ((metrics.historical.successfulExecutions / metrics.historical.totalExecutions) * 100).toFixed(1) + '%'
          : '0%',
        avgExecutionTime: `${metrics.historical.averageExecutionTimeMs.toFixed(0)}ms`,
        securityEvents: metrics.historical.totalSecurityEvents
      },
      alerts: metrics.alerts.filter(alert => !alert.acknowledged).length
    };
  }

  getTopSkills(limit: number = 5) {
    const stats = this.getHistoricalStats();
    return Object.entries(stats.skillStats)
      .sort(([, a], [, b]) => b.executions - a.executions)
      .slice(0, limit)
      .map(([skillId, stats]) => ({
        skillId,
        executions: stats.executions,
        successRate: ((stats.successes / stats.executions) * 100).toFixed(1) + '%',
        avgTime: `${stats.avgTimeMs.toFixed(0)}ms`,
        securityEvents: stats.securityEvents
      }));
  }
}