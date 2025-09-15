import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { ErrorHandler, ErrorEvent, ErrorContext, ErrorSeverity } from './error-handler';

// Error report types
export interface ErrorReport {
  id: string;
  timestamp: number;
  error: ErrorEvent;
  environment: EnvironmentInfo;
  system: SystemInfo;
  diagnostics: DiagnosticsInfo;
  tags: string[];
  severity: ErrorSeverity;
}

// Environment information
interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cwd: string;
  hostname: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

// System information
interface SystemInfo {
  totalMemory: number;
  freeMemory: number;
  loadAverage: number[];
  cpus: number;
  osType: string;
  osRelease: string;
}

// Diagnostics information
interface DiagnosticsInfo {
  stackTrace: string;
  errorChain: Error[];
  operation: string;
  resourceUsage: ResourceUsage;
  timing: TimingInfo;
}

// Resource usage
interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  heapUsed: number;
  heapTotal: number;
}

// Timing information
interface TimingInfo {
  executionTime: number;
  responseTime: number;
  processingTime: number;
}

// Reporter configuration
export interface ErrorReporterOptions {
  enabled: boolean;
  maxReports: number;
  reportExpiryMs: number;
  includeEnvironment: boolean;
  includeSystemInfo: boolean;
  includeDiagnostics: boolean;
  minSeverity: ErrorSeverity;
  exportFormats: ('json' | 'text' | 'html')[];
  customTags?: string[];
}

// Default reporter configuration
const DEFAULT_REPORTER_OPTIONS: ErrorReporterOptions = {
  enabled: true,
  maxReports: 1000,
  reportExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  includeEnvironment: true,
  includeSystemInfo: true,
  includeDiagnostics: true,
  minSeverity: 'error',
  exportFormats: ['json', 'text'],
};

/**
 * Comprehensive error reporting and diagnostics system
 */
export class ErrorReporter extends EventEmitter {
  private reports: ErrorReport[] = [];
  private options: ErrorReporterOptions;

  constructor(
    private errorHandler: ErrorHandler,
    options: Partial<ErrorReporterOptions> = {}
  ) {
    super();
    this.options = { ...DEFAULT_REPORTER_OPTIONS, ...options };
    this.setupErrorHandling();
  }

  /**
   * Setup error handling hooks
   */
  private setupErrorHandling(): void {
    this.errorHandler.on('error', (errorEvent: ErrorEvent) => {
      if (this.shouldReportError(errorEvent)) {
        this.generateErrorReport(errorEvent);
      }
    });
  }

  /**
   * Generate comprehensive error report
   */
  private async generateErrorReport(errorEvent: ErrorEvent): Promise<void> {
    try {
      const report: ErrorReport = {
        id: this.generateReportId(),
        timestamp: Date.now(),
        error: errorEvent,
        environment: this.collectEnvironmentInfo(),
        system: this.collectSystemInfo(),
        diagnostics: await this.collectDiagnosticsInfo(errorEvent),
        tags: this.generateTags(errorEvent),
        severity: errorEvent.severity,
      };

      this.addReport(report);
      this.emit('reportGenerated', report);

      // Export report if configured
      await this.exportReport(report);

    } catch (reportError) {
      this.emit('reportError', {
        error: reportError,
        originalError: errorEvent,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Collect environment information
   */
  private collectEnvironmentInfo(): EnvironmentInfo {
    if (!this.options.includeEnvironment) {
      return {} as EnvironmentInfo;
    }

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      hostname: os.hostname(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Collect system information
   */
  private collectSystemInfo(): SystemInfo {
    if (!this.options.includeSystemInfo) {
      return {} as SystemInfo;
    }

    return {
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      cpus: os.cpus().length,
      osType: os.type(),
      osRelease: os.release(),
    };
  }

  /**
   * Collect diagnostics information
   */
  private async collectDiagnosticsInfo(errorEvent: ErrorEvent): Promise<DiagnosticsInfo> {
    if (!this.options.includeDiagnostics) {
      return {} as DiagnosticsInfo;
    }

    return {
      stackTrace: errorEvent.context.stackTrace || '',
      errorChain: await this.extractErrorChain(errorEvent),
      operation: errorEvent.context.skillId || 'unknown',
      resourceUsage: this.collectResourceUsage(),
      timing: this.collectTimingInfo(),
    };
  }

  /**
   * Extract error chain from error event
   */
  private async extractErrorChain(errorEvent: ErrorEvent): Promise<Error[]> {
    const errors: Error[] = [];

    // Add primary error
    if (errorEvent.context.additionalData?.originalError) {
      errors.push(errorEvent.context.additionalData.originalError);
    }

    // TODO: Extract from error cause chain (Node.js 16+)
    // if (errorEvent.context.additionalData?.cause) {
    //   errors.push(...this.extractCauseChain(errorEvent.context.additionalData.cause));
    // }

    return errors;
  }

  /**
   * Collect resource usage information
   */
  private collectResourceUsage(): ResourceUsage {
    const memoryUsage = process.memoryUsage();

    return {
      cpuUsage: this.calculateCpuUsage(),
      memoryUsage: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
    };
  }

  /**
   * Calculate CPU usage (simplified)
   */
  private calculateCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, you might use a more sophisticated approach
    const startUsage = process.cpuUsage();
    // Simulate some work to get CPU usage
    for (let i = 0; i < 1000000; i++) {}
    const endUsage = process.cpuUsage(startUsage);

    return (endUsage.user + endUsage.system) / 1000; // Convert to milliseconds
  }

  /**
   * Collect timing information
   */
  private collectTimingInfo(): TimingInfo {
    return {
      executionTime: 0, // Would be populated from operation context
      responseTime: 0, // Would be populated from operation context
      processingTime: 0, // Would be populated from operation context
    };
  }

  /**
   * Generate tags for error report
   */
  private generateTags(errorEvent: ErrorEvent): string[] {
    const tags: string[] = [
      errorEvent.severity,
      errorEvent.code,
      process.platform,
      `node-${process.version}`,
      ...(this.options.customTags || []),
    ];

    if (errorEvent.context.skillId) {
      tags.push(`skill:${errorEvent.context.skillId}`);
    }

    if (errorEvent.context.scriptType) {
      tags.push(`type:${errorEvent.context.scriptType}`);
    }

    return tags.filter((tag, index, array) => array.indexOf(tag) === index);
  }

  /**
   * Add report to history with cleanup
   */
  private addReport(report: ErrorReport): void {
    // Clean up old reports
    this.cleanupOldReports();

    // Add to reports array
    this.reports.push(report);

    // Limit total reports stored
    if (this.reports.length > this.options.maxReports) {
      this.reports = this.reports.slice(-this.options.maxReports);
    }
  }

  /**
   * Clean up old reports
   */
  private cleanupOldReports(): void {
    const now = Date.now();
    this.reports = this.reports.filter(
      report => now - report.timestamp < this.options.reportExpiryMs
    );
  }

  /**
   * Export report in configured formats
   */
  private async exportReport(report: ErrorReport): Promise<void> {
    for (const format of this.options.exportFormats) {
      try {
        let exportedData: string;

        switch (format) {
          case 'json':
            exportedData = this.exportAsJson(report);
            break;
          case 'text':
            exportedData = this.exportAsText(report);
            break;
          case 'html':
            exportedData = this.exportAsHtml(report);
            break;
          default:
            continue;
        }

        this.emit('reportExported', {
          reportId: report.id,
          format,
          data: exportedData,
          timestamp: Date.now(),
        });

      } catch (exportError) {
        this.emit('exportError', {
          error: exportError,
          reportId: report.id,
          format,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Export report as JSON
   */
  private exportAsJson(report: ErrorReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as text
   */
  private exportAsText(report: ErrorReport): string {
    return `
Error Report: ${report.id}
Timestamp: ${new Date(report.timestamp).toISOString()}
Severity: ${report.severity}
Error Code: ${report.error.code}
Message: ${report.error.message}

Environment:
- Node.js: ${report.environment.nodeVersion}
- Platform: ${report.environment.platform}
- Architecture: ${report.environment.arch}
- Hostname: ${report.environment.hostname}

Stack Trace:
${report.diagnostics.stackTrace || 'No stack trace available'}

Tags: ${report.tags.join(', ')}
    `.trim();
  }

  /**
   * Export report as HTML
   */
  private exportAsHtml(report: ErrorReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Error Report - ${report.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .section { margin-bottom: 20px; }
        .label { font-weight: bold; color: #555; }
        .value { margin-left: 10px; }
        .stack-trace { white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 10px; }
    </style>
</head>
<body>
    <h1>Error Report: ${report.id}</h1>

    <div class="section">
        <div class="label">Timestamp:</div>
        <div class="value">${new Date(report.timestamp).toISOString()}</div>
    </div>

    <div class="section">
        <div class="label">Severity:</div>
        <div class="value">${report.severity}</div>
    </div>

    <div class="section">
        <div class="label">Error Code:</div>
        <div class="value">${report.error.code}</div>
    </div>

    <div class="section">
        <div class="label">Message:</div>
        <div class="value">${report.error.message}</div>
    </div>

    <div class="section">
        <h2>Stack Trace</h2>
        <div class="stack-trace">${report.diagnostics.stackTrace || 'No stack trace available'}</div>
    </div>

    <div class="section">
        <h2>Tags</h2>
        <div class="value">${report.tags.join(', ')}</div>
    </div>
</body>
</html>
    `.trim();
  }

  /**
   * Check if error should be reported
   */
  private shouldReportError(errorEvent: ErrorEvent): boolean {
    if (!this.options.enabled) return false;

    const severityLevels: ErrorSeverity[] = ['debug', 'info', 'warning', 'error', 'critical'];
    const thresholdIndex = severityLevels.indexOf(this.options.minSeverity);
    const errorIndex = severityLevels.indexOf(errorEvent.severity);

    return errorIndex >= thresholdIndex;
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all reports
   */
  getAllReports(): ErrorReport[] {
    return [...this.reports];
  }

  /**
   * Get reports by severity
   */
  getReportsBySeverity(severity: ErrorSeverity): ErrorReport[] {
    return this.reports.filter(report => report.severity === severity);
  }

  /**
   * Get reports by error code
   */
  getReportsByErrorCode(code: string): ErrorReport[] {
    return this.reports.filter(report => report.error.code === code);
  }

  /**
   * Get reports by tag
   */
  getReportsByTag(tag: string): ErrorReport[] {
    return this.reports.filter(report => report.tags.includes(tag));
  }

  /**
   * Get report statistics
   */
  getReportStatistics(): {
    totalReports: number;
    reportsBySeverity: Record<ErrorSeverity, number>;
    reportsByErrorCode: Record<string, number>;
    reportsByTag: Record<string, number>;
    lastReportTimestamp: number | null;
  } {
    const reportsBySeverity: Record<ErrorSeverity, number> = {
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    const reportsByErrorCode: Record<string, number> = {};
    const reportsByTag: Record<string, number> = {};
    let lastReportTimestamp: number | null = null;

    for (const report of this.reports) {
      reportsBySeverity[report.severity]++;
      reportsByErrorCode[report.error.code] = (reportsByErrorCode[report.error.code] || 0) + 1;

      for (const tag of report.tags) {
        reportsByTag[tag] = (reportsByTag[tag] || 0) + 1;
      }

      if (!lastReportTimestamp || report.timestamp > lastReportTimestamp) {
        lastReportTimestamp = report.timestamp;
      }
    }

    return {
      totalReports: this.reports.length,
      reportsBySeverity,
      reportsByErrorCode,
      reportsByTag,
      lastReportTimestamp,
    };
  }

  /**
   * Clear report history
   */
  clearReports(): void {
    this.reports = [];
    this.emit('reportsCleared', { timestamp: Date.now() });
  }

  /**
   * Set reporter options
   */
  setOptions(options: Partial<ErrorReporterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): ErrorReporterOptions {
    return { ...this.options };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.reports = [];
    this.removeAllListeners();
  }
}

/**
 * Factory function to create error reporter
 */
export function createErrorReporter(errorHandler: ErrorHandler, options?: Partial<ErrorReporterOptions>): ErrorReporter {
  return new ErrorReporter(errorHandler, options);
}