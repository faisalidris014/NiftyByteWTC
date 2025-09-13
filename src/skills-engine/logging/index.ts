// First import all types
import { LoggerConfig, LogLevel } from './types';
import { Logger } from './Logger';
import { LogManager } from './LogManager';
import { MonitoringSystem } from './MonitoringSystem';
import { SecurityAuditLogger } from './SecurityAuditLogger';
import { MonitoringDashboard } from './Dashboard';

// Export logging system components
export * from './types';
export { Logger } from './Logger';
export { LogManager } from './LogManager';
export { MonitoringSystem } from './MonitoringSystem';
export { SecurityAuditLogger } from './SecurityAuditLogger';
export { MonitoringDashboard } from './Dashboard';

export { ConsoleDestination } from './destinations/ConsoleDestination';
export { FileDestination } from './destinations/FileDestination';
export { DatabaseDestination } from './destinations/DatabaseDestination';

// Default configurations
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  defaultLevel: 'info' as const,
  destinations: [
    {
      type: 'console' as const,
      enabled: true,
      level: 'info' as const
    },
    {
      type: 'file' as const,
      enabled: true,
      level: 'debug' as const,
      options: {
        filePath: './logs/wtc-skills.log',
        format: 'json' as const
      },
      rotation: {
        enabled: true,
        maxSizeBytes: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        compress: true,
        retentionDays: 30
      }
    }
  ],
  includeStackTrace: true,
  maxContextDepth: 3,
  bufferSize: 1000,
  flushIntervalMs: 5000
};

export const DEFAULT_MONITORING_CONFIG = {
  updateIntervalMs: 1000,
  statsResetIntervalMs: 60 * 60 * 1000, // 1 hour
  maxAuditEntries: 10000,
  maxAlerts: 100
};

export const DEFAULT_SECURITY_CONFIG = {
  encryptionRequired: true,
  integrityChecking: true,
  retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
  accessLogging: true
};

// Utility functions
export function createLogger(config?: Partial<LoggerConfig>) {
  return new Logger({ ...DEFAULT_LOGGER_CONFIG, ...config });
}

export function getLogManager(config?: Partial<LoggerConfig>) {
  return LogManager.getInstance({ ...DEFAULT_LOGGER_CONFIG, ...config });
}

export function createMonitoringSystem(logger?: Logger) {
  return new MonitoringSystem(logger || createLogger());
}

export function createSecurityAuditLogger() {
  return new SecurityAuditLogger();
}

// Quick start function
export function initializeLoggingSystem(config?: {
  logger?: Partial<LoggerConfig>;
  monitoring?: Partial<typeof DEFAULT_MONITORING_CONFIG>;
  security?: Partial<typeof DEFAULT_SECURITY_CONFIG>;
}) {
  const logger = createLogger(config?.logger);
  const monitoringSystem = createMonitoringSystem(logger);
  const securityAuditLogger = createSecurityAuditLogger();
  const logManager = getLogManager(config?.logger);

  logger.info('Logging system initialized', {
    config: {
      logger: logger.getConfig(),
      monitoring: DEFAULT_MONITORING_CONFIG,
      security: DEFAULT_SECURITY_CONFIG
    }
  });

  return {
    logger,
    monitoringSystem,
    securityAuditLogger,
    logManager
  };
}

// Dashboard creation
export function createDashboard() {
  return new MonitoringDashboard();
}