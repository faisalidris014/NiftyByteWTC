import {
  getLogManager,
  createLogger,
  createMonitoringSystem,
  createSecurityAuditLogger,
  DEFAULT_LOGGER_CONFIG,
  LogManager
} from '../index';

// Example 1: Basic usage with default configuration
export function basicUsageExample() {
  const logManager = getLogManager();

  logManager.info('Application started');

  // Start monitoring an execution
  logManager.startExecution('exec_123', 'disk-cleanup-skill');

  // Log with context
  logManager.debug('Processing file', {
    fileName: 'large_file.txt',
    fileSize: 1024 * 1024,
    operation: 'compress'
  });

  // Record security event
  logManager.recordSecurityEvent('exec_123', 'medium', 'Attempted access to restricted directory');

  // End execution
  logManager.endExecution('exec_123', true);

  logManager.info('Application completed');
}

// Example 2: Custom logger configuration
export function customConfigurationExample() {
  const customConfig = {
    ...DEFAULT_LOGGER_CONFIG,
    defaultLevel: 'debug',
    destinations: [
      {
        type: 'console' as const,
        enabled: true,
        level: 'debug' as const
      },
      {
        type: 'file' as const,
        enabled: true,
        level: 'info' as const,
        options: {
          filePath: './logs/custom-app.log',
          format: 'json' as const
        },
        rotation: {
          enabled: true,
          maxSizeBytes: 5 * 1024 * 1024,
          maxFiles: 5,
          compress: true,
          retentionDays: 7
        }
      }
    ]
  };

  const logger = createLogger(customConfig);

  logger.debug('Debug message with custom config');
  logger.info('Info message with custom config');
}

// Example 3: Comprehensive monitoring example
export async function comprehensiveMonitoringExample() {
  const logManager = getLogManager();
  const monitoringSystem = createMonitoringSystem(logManager.getLogger());
  const securityLogger = createSecurityAuditLogger();

  // Start execution
  const executionId = 'exec_monitor_001';
  const skillId = 'system-health-check';

  monitoringSystem.startExecution(executionId, skillId);

  // Simulate execution with metrics updates
  const startTime = Date.now();

  // Update metrics during execution
  monitoringSystem.updateExecutionMetrics(executionId, {
    cpuUsage: { average: 25.5, peak: 75.2, total: 1024 },
    memoryUsage: { averageBytes: 50 * 1024 * 1024, peakBytes: 80 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 },
    diskUsage: { readBytes: 1024 * 1024, writeBytes: 512 * 1024, operations: 42 },
    networkUsage: { sentBytes: 2048, receivedBytes: 4096, connections: 3 },
    securityEvents: 2
  });

  // Record security events
  monitoringSystem.recordSecurityEvent(executionId, 'high', 'Unauthorized network access attempt');
  monitoringSystem.recordSecurityEvent(executionId, 'medium', 'Temporary file cleanup required');

  // Record audit events
  securityLogger.recordUserAction(
    'user123',
    'execute',
    'skill',
    skillId,
    { parameters: { scanDepth: 'deep', fixIssues: true } },
    { ipAddress: '192.168.1.100', userAgent: 'WindowsTroubleshooter/1.0' }
  );

  // End execution
  const success = true;
  monitoringSystem.endExecution(executionId, success);

  // Get dashboard metrics
  const dashboard = monitoringSystem.getDashboardMetrics();
  console.log('Dashboard metrics:', dashboard);

  // Generate compliance report
  const complianceReport = securityLogger.generateComplianceReport(startTime);
  console.log('Compliance report:', complianceReport);
}

// Example 4: Error handling and performance tracking
export function errorHandlingExample() {
  const logManager = getLogManager();

  try {
    // Start performance timer
    const endTimer = logManager.getLogger().startTimer('database_query');

    // Simulate some work
    const result = performRiskyOperation();

    // End timer and log duration
    const duration = endTimer();
    logManager.info('Operation completed', { durationMs: duration, result });

  } catch (error) {
    logManager.error('Operation failed', error as Error, {
      operation: 'database_query',
      attempt: 1
    });

    // Record audit event for failed operation
    const securityLogger = createSecurityAuditLogger();
    securityLogger.recordAccessAttempt(
      'user123',
      'database',
      'query',
      false,
      { error: (error as Error).message },
      { ipAddress: '192.168.1.100' }
    );
  }
}

function performRiskyOperation(): any {
  // Simulate an operation that might fail
  if (Math.random() > 0.7) {
    throw new Error('Database connection timeout');
  }
  return { data: [1, 2, 3], status: 'success' };
}

// Example 5: Health check and maintenance
export async function maintenanceExample() {
  const logManager = getLogManager();

  // Perform health check
  const health = await logManager.healthCheck();
  console.log('System health:', health);

  if (health.status === 'healthy') {
    // Rotate logs
    await logManager.rotateLogs();

    // Cleanup old logs
    await logManager.cleanupOldLogs(30);

    logManager.info('Maintenance operations completed');
  } else {
    logManager.warn('Skipping maintenance due to system issues', { issues: health.issues });
  }
}

// Run all examples
export function runAllExamples() {
  console.log('=== Basic Usage Example ===');
  basicUsageExample();

  console.log('\n=== Custom Configuration Example ===');
  customConfigurationExample();

  console.log('\n=== Error Handling Example ===');
  errorHandlingExample();

  console.log('\n=== Maintenance Example ===');
  maintenanceExample().catch(console.error);

  // Comprehensive monitoring runs async operations
  console.log('\n=== Comprehensive Monitoring Example ===');
  comprehensiveMonitoringExample().catch(console.error);
}

// Export for use in other modules
export default {
  basicUsageExample,
  customConfigurationExample,
  comprehensiveMonitoringExample,
  errorHandlingExample,
  maintenanceExample,
  runAllExamples
};