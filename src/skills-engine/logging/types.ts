// Logging system types and interfaces

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'audit';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  correlationId?: string;
  skillId?: string;
  executionId?: string;
  userId?: string;
  component: string;
  context?: Record<string, any>;
  error?: Error;
  durationMs?: number;
  resourceUsage?: {
    cpuPercentage: number;
    memoryBytes: number;
    diskWriteBytes: number;
    networkBytes: number;
  };
  securityEvents?: Array<{
    type: string;
    severity: string;
    details: string;
  }>;
}

export interface LogDestination {
  write(entry: LogEntry): Promise<void> | void;
  flush?(): Promise<void> | void;
  close?(): Promise<void> | void;
}

export interface LogFilter {
  level?: LogLevel | LogLevel[];
  component?: string | string[];
  skillId?: string | string[];
  correlationId?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  startTime?: number;
  endTime?: number;
}

export interface LogRotationConfig {
  enabled: boolean;
  maxSizeBytes: number;
  maxFiles: number;
  compress: boolean;
  retentionDays: number;
}

export interface LogDestinationConfig {
  type: 'file' | 'console' | 'database' | 'elasticsearch' | 'splunk' | 'custom';
  enabled: boolean;
  level: LogLevel;
  options?: Record<string, any>;
  rotation?: LogRotationConfig;
}

export interface LoggerConfig {
  defaultLevel: LogLevel;
  destinations: LogDestinationConfig[];
  correlationIdHeader?: string;
  includeStackTrace: boolean;
  maxContextDepth: number;
  bufferSize: number;
  flushIntervalMs: number;
}

export interface PerformanceMetrics {
  executionId: string;
  skillId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  cpuUsage: {
    average: number;
    peak: number;
    total: number;
  };
  memoryUsage: {
    averageBytes: number;
    peakBytes: number;
    totalBytes: number;
  };
  diskUsage: {
    readBytes: number;
    writeBytes: number;
    operations: number;
  };
  networkUsage: {
    sentBytes: number;
    receivedBytes: number;
    connections: number;
  };
  securityEvents: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface AuditLogEntry {
  timestamp: number;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  status: 'success' | 'failure' | 'pending';
  correlationId?: string;
}

export interface MonitoringStats {
  period: {
    start: number;
    end: number;
  };
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  p99ExecutionTimeMs: number;
  totalSecurityEvents: number;
  highSeverityEvents: number;
  resourceUsage: {
    maxCpuPercentage: number;
    maxMemoryBytes: number;
    maxDiskWriteBytes: number;
    maxNetworkBytes: number;
  };
  skillStats: Record<string, {
    executions: number;
    successes: number;
    failures: number;
    avgTimeMs: number;
    securityEvents: number;
  }>;
  errorDistribution: Record<string, number>;
}

export interface SearchCriteria {
  query?: string;
  filters?: LogFilter;
  sortBy?: 'timestamp' | 'level' | 'durationMs';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

export interface DashboardMetrics {
  realTime: {
    activeExecutions: number;
    cpuUsage: number;
    memoryUsage: number;
    recentErrors: number;
  };
  historical: MonitoringStats;
  alerts: Array<{
    id: string;
    level: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    acknowledged: boolean;
  }>;
}