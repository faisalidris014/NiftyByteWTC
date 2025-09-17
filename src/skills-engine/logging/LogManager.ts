import { Logger } from './Logger';
import { LoggerConfig, EndpointHealthStatus, QueueHealthStatus, AlertRule, NotificationChannelConfig } from './types';
import { MonitoringSystem } from './MonitoringSystem';
import { SearchCriteria, SearchResult, LogFilter } from './types';

export class LogManager {
  private static instance: LogManager;
  private logger: Logger;
  private monitoringSystem: MonitoringSystem;
  private searchIndex: Map<string, any> = new Map();

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.logger = new Logger(config);
    this.monitoringSystem = new MonitoringSystem(this.logger);
    this.initializeSearchIndex();
  }

  static getInstance(config?: Partial<LoggerConfig>): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager(config);
    }
    return LogManager.instance;
  }

  private initializeSearchIndex(): void {
    // Initialize search index structure
    // This would typically connect to Elasticsearch, Meilisearch, or similar
    // For now, we'll maintain a simple in-memory index
  }

  // Logger proxy methods
  debug(message: string, context?: Record<string, any>, metadata?: any): void {
    this.logger.debug(message, context, metadata);
  }

  info(message: string, context?: Record<string, any>, metadata?: any): void {
    this.logger.info(message, context, metadata);
  }

  warn(message: string, context?: Record<string, any>, metadata?: any): void {
    this.logger.warn(message, context, metadata);
  }

  error(message: string, error?: Error, context?: Record<string, any>, metadata?: any): void {
    this.logger.error(message, error, context, metadata);
  }

  fatal(message: string, error?: Error, context?: Record<string, any>, metadata?: any): void {
    this.logger.fatal(message, error, context, metadata);
  }

  audit(message: string, context?: Record<string, any>, metadata?: any): void {
    this.logger.audit(message, context, metadata);
  }

  // Monitoring system proxy methods
  startExecution(executionId: string, skillId: string): void {
    this.monitoringSystem.startExecution(executionId, skillId);
  }

  updateExecutionMetrics(executionId: string, updates: any): void {
    this.monitoringSystem.updateExecutionMetrics(executionId, updates);
  }

  endExecution(executionId: string, success: boolean, error?: { code: string; message: string }): void {
    this.monitoringSystem.endExecution(executionId, success, error);
  }

  recordSecurityEvent(executionId: string, severity: 'low' | 'medium' | 'high', details: string): void {
    this.monitoringSystem.recordSecurityEvent(executionId, severity, details);
  }

  recordAuditEvent(entry: any): void {
    this.monitoringSystem.recordAuditEvent(entry);
  }

  updateEndpointHealth(status: EndpointHealthStatus): void {
    this.monitoringSystem.updateEndpointHealth(status);
  }

  markEndpointOffline(endpointId: string, reason?: string): void {
    this.monitoringSystem.markEndpointOffline(endpointId, reason);
  }

  updateQueueHealth(stats: QueueHealthStatus): void {
    this.monitoringSystem.updateQueueHealth(stats);
  }

  configureAlerting(options: { rules?: AlertRule[]; channels?: NotificationChannelConfig[] }): void {
    this.monitoringSystem.configureAlerting(options);
  }

  // Search functionality
  async search(criteria: SearchCriteria): Promise<SearchResult> {
    // Implement search logic
    // This would typically query a search engine or database
    // For now, return empty results
    return {
      entries: [],
      total: 0,
      hasMore: false
    };
  }

  async searchByFilter(filter: LogFilter): Promise<SearchResult> {
    // Implement filter-based search
    return {
      entries: [],
      total: 0,
      hasMore: false
    };
  }

  // Analytics and reporting
  getPerformanceReport(skillId?: string): any {
    const metrics = this.monitoringSystem.getDashboardMetrics();

    if (skillId) {
      return {
        skillId,
        stats: metrics.historical.skillStats[skillId] || {},
        recentExecutions: this.getRecentExecutions(skillId)
      };
    }

    return metrics;
  }

  getRecentExecutions(skillId: string, limit: number = 10): any[] {
    // Get recent executions for a specific skill
    // This would query the monitoring system or database
    return [];
  }

  getErrorAnalysis(): any {
    const metrics = this.monitoringSystem.getDashboardMetrics();
    return {
      totalErrors: metrics.historical.failedExecutions,
      errorDistribution: metrics.historical.errorDistribution,
      recentErrors: metrics.realTime.recentErrors
    };
  }

  getSecurityReport(): any {
    const metrics = this.monitoringSystem.getDashboardMetrics();
    return {
      totalSecurityEvents: metrics.historical.totalSecurityEvents,
      highSeverityEvents: metrics.historical.highSeverityEvents,
      recentEvents: this.getRecentSecurityEvents()
    };
  }

  getQueueHealth() {
    const metrics = this.monitoringSystem.getDashboardMetrics();
    return metrics.queueHealth;
  }

  getRecentSecurityEvents(limit: number = 20): any[] {
    // Get recent security events
    return [];
  }

  // Configuration management
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    // Note: This would require recreating the logger with new config
    // For now, just log the config change
    this.logger.info('Configuration update requested', { newConfig });
  }

  getCurrentConfig(): LoggerConfig {
    return this.logger.getConfig();
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check if logger is functioning
      await this.logger.flush();
    } catch (error) {
      issues.push(`Logger flush failed: ${error}`);
    }

    // Check destinations
    const destinations = this.logger.getDestinations();
    if (destinations.length === 0) {
      issues.push('No log destinations configured');
    }

    return {
      status: issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'degraded' : 'unhealthy',
      issues
    };
  }

  // Maintenance operations
  async rotateLogs(): Promise<void> {
    this.logger.info('Manual log rotation initiated');
    // Implement log rotation logic
  }

  async cleanupOldLogs(retentionDays: number = 30): Promise<void> {
    this.logger.info('Old log cleanup initiated', { retentionDays });
    // Implement cleanup logic
  }

  // Shutdown
  async shutdown(): Promise<void> {
    this.logger.info('Log manager shutdown initiated');

    await this.logger.flush();
    await this.monitoringSystem.shutdown();
    await this.logger.close();

    this.logger.info('Log manager shutdown completed');
  }

  // Get instances for direct access (if needed)
  getLogger(): Logger {
    return this.logger;
  }

  getMonitoringSystem(): MonitoringSystem {
    return this.monitoringSystem;
  }
}
