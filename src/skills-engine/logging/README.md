# Comprehensive Logging and Monitoring System

This system provides enterprise-grade logging, monitoring, and auditing capabilities for the Windows AI Troubleshooter skills engine.

## Features

### 🎯 Core Logging
- **Structured logging** with correlation IDs and execution context
- **Multiple log levels**: debug, info, warn, error, fatal, audit
- **Flexible destinations**: console, file, database, custom
- **Log rotation** with compression and retention policies
- **Buffered writes** for performance optimization

### 📊 Performance Monitoring
- **Real-time metrics**: CPU, memory, active executions, error rates
- **Execution tracking**: start/end times, duration, resource usage
- **Historical statistics**: success rates, average execution times, trends
- **Skill-specific analytics**: per-skill performance metrics

### 🔒 Security & Compliance
- **Security event logging**: unauthorized access, resource violations
- **Audit trails**: user actions, data processing, compliance events
- **GDPR/HIPAA compliant**: encryption, integrity checking, retention
- **Access control logging**: successful/failed access attempts

### 📈 Dashboard & Analytics
- **Real-time dashboard**: live metrics and alerts
- **Search capabilities**: filter logs by various criteria
- **Export functionality**: JSON, CSV reports
- **Health monitoring**: system status and issue detection

## Quick Start

### Basic Usage

```typescript
import { getLogManager } from './logging';

const logManager = getLogManager();

// Basic logging
logManager.info('Application started');
logManager.debug('Processing data', { fileName: 'data.txt', size: 1024 });

// Error handling
try {
  riskyOperation();
} catch (error) {
  logManager.error('Operation failed', error);
}

// Monitoring executions
logManager.startExecution('exec_123', 'disk-cleanup');
logManager.endExecution('exec_123', true);
```

### Advanced Configuration

```typescript
import { createLogger, DEFAULT_LOGGER_CONFIG } from './logging';

const customConfig = {
  ...DEFAULT_LOGGER_CONFIG,
  defaultLevel: 'debug',
  destinations: [
    {
      type: 'console',
      enabled: true,
      level: 'debug'
    },
    {
      type: 'file',
      enabled: true,
      level: 'info',
      options: {
        filePath: './logs/app.log',
        format: 'json'
      },
      rotation: {
        enabled: true,
        maxSizeBytes: 10 * 1024 * 1024,
        maxFiles: 10,
        compress: true,
        retentionDays: 30
      }
    }
  ]
};

const logger = createLogger(customConfig);
```

### Real-time Dashboard

```typescript
import { createDashboard } from './logging';

const dashboard = createDashboard();

// Start real-time updates
dashboard.startRealTimeUpdates(1000);

// Subscribe to metrics
const unsubscribe = dashboard.subscribe(metrics => {
  console.log('Active executions:', metrics.realTime.activeExecutions);
  console.log('CPU usage:', metrics.realTime.cpuUsage);
  console.log('Recent errors:', metrics.realTime.recentErrors);
});

// Get historical data
const stats = dashboard.getHistoricalStats();
console.log('Total executions:', stats.totalExecutions);
console.log('Success rate:', (stats.successfulExecutions / stats.totalExecutions * 100).toFixed(1) + '%');

// Export report
const report = await dashboard.exportReport('json');
```

### Security Auditing

```typescript
import { createSecurityAuditLogger } from './logging';

const auditLogger = createSecurityAuditLogger();

// User actions
auditLogger.recordUserAction(
  'user123',
  'execute',
  'skill',
  'disk-cleanup',
  { parameters: { depth: 'deep' } },
  { ipAddress: '192.168.1.100', userAgent: 'WTC/1.0' }
);

// Security events
auditLogger.recordSecurityEvent(
  'user123',
  'unauthorized_access',
  'high',
  { resource: '/system/files', action: 'read' },
  { ipAddress: '192.168.1.200' }
);

// Compliance reporting
const report = auditLogger.generateComplianceReport(
  Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
);
```

## Architecture

### Components

1. **Logger**: Core logging functionality with multiple destinations
2. **LogManager**: Singleton manager for application-wide logging
3. **MonitoringSystem**: Real-time performance metrics and statistics
4. **SecurityAuditLogger**: Compliance-focused audit logging
5. **Dashboard**: Real-time monitoring and analytics interface
6. **Destinations**: Console, File, Database output handlers

### Data Flow

```
Application → LogManager → Logger → Destinations (Console/File/DB)
                       → MonitoringSystem (Metrics)
                       → SecurityAuditLogger (Compliance)
                       → Dashboard (Real-time UI)
```

## Configuration Options

### Logger Configuration

```typescript
interface LoggerConfig {
  defaultLevel: LogLevel;          // Default log level
  destinations: LogDestinationConfig[]; // Output destinations
  correlationIdHeader?: string;    // HTTP header for correlation IDs
  includeStackTrace: boolean;      // Include stack traces in errors
  maxContextDepth: number;         // Maximum object depth for context
  bufferSize: number;              // Buffer size before flushing
  flushIntervalMs: number;         // Flush interval in milliseconds
}
```

### Destination Types

- **console**: Output to console with colors and formatting
- **file**: File output with rotation and compression
- **database**: Database storage with batching
- **elasticsearch**: Elasticsearch integration (custom)
- **splunk**: Splunk integration (custom)

## Security Features

### Encryption
- All audit logs are encrypted using AES-256-GCM
- Encryption keys managed securely
- Integrity checking with SHA-256 hashes

### Compliance
- **GDPR**: Data processing records, right to be forgotten
- **HIPAA**: Access controls, audit trails
- **SOC2**: Security controls, monitoring
- **ISO27001**: Information security management

### Retention Policies
- Configurable retention periods (default: 1 year)
- Automated cleanup of old logs
- Export capabilities for compliance audits

## Performance Considerations

### Buffering
- Log entries are buffered in memory for performance
- Configurable buffer size and flush intervals
- Automatic flushing on buffer full or process exit

### Resource Usage
- Minimal overhead for logging operations
- Asynchronous writes to avoid blocking
- Efficient memory usage for metrics collection

### Scalability
- Designed for high-volume logging
- Multiple destination support
- Database batching for efficient storage

## Integration Guide

### With Existing Sandbox

The logging system is automatically integrated with the skill sandbox:

```typescript
import { SkillSandbox } from '../sandbox';

const sandbox = new SkillSandbox('script.ps1', 'powershell');

// Logging happens automatically:
// - Execution start/end
// - Security events
// - Performance metrics
// - Error handling

const result = await sandbox.execute(['-param', 'value']);
```

### Custom Integration

For custom components:

```typescript
import { getLogManager } from './logging';

class CustomComponent {
  private logManager = getLogManager();
  private executionId: string;

  constructor() {
    this.executionId = this.generateId();
  }

  async execute() {
    this.logManager.startExecution(this.executionId, 'custom-component');

    try {
      // Your logic here
      this.logManager.info('Operation started', { details: '...' });

      // Update metrics
      this.logManager.updateExecutionMetrics(this.executionId, {
        cpuUsage: { average: 25, peak: 50, total: 100 }
      });

      this.logManager.endExecution(this.executionId, true);
    } catch (error) {
      this.logManager.endExecution(this.executionId, false, {
        code: 'CUSTOM_ERROR',
        message: error.message
      });
      throw error;
    }
  }
}
```

## API Reference

### LogManager Methods

- `info(message, context, metadata)` - Information messages
- `debug(message, context, metadata)` - Debug messages
- `warn(message, context, metadata)` - Warning messages
- `error(message, error, context, metadata)` - Error messages
- `fatal(message, error, context, metadata)` - Fatal errors
- `audit(message, context, metadata)` - Audit trail messages
- `startExecution(executionId, skillId)` - Start monitoring execution
- `endExecution(executionId, success, error)` - End execution monitoring
- `recordSecurityEvent(executionId, severity, details)` - Record security event

### MonitoringSystem Methods

- `getDashboardMetrics()` - Get current metrics
- `getExecutionMetrics(executionId)` - Get specific execution metrics
- `getAllMetrics()` - Get all active executions
- `getAuditLog(filter)` - Get audit entries
- `healthCheck()` - System health status

### SecurityAuditLogger Methods

- `recordUserAction(userId, action, resource, details, metadata)`
- `recordSecurityEvent(userId, eventType, severity, details, metadata)`
- `recordAccessAttempt(userId, resource, action, success, details, metadata)`
- `recordComplianceEvent(standard, requirement, status, evidence, metadata)`
- `generateComplianceReport(startTime, endTime)`
- `exportAuditLog(format, filters)`

## Best Practices

1. **Use correlation IDs**: Pass correlation IDs across service boundaries
2. **Structured logging**: Use context objects instead of string concatenation
3. **Appropriate levels**: Use debug for development, info for production
4. **Security sensitive data**: Never log passwords, tokens, or PII
5. **Performance monitoring**: Track execution times and resource usage
6. **Error handling**: Always log errors with proper context
7. **Audit trails**: Record all security-relevant actions

## Troubleshooting

### Common Issues

1. **Missing logs**: Check destination configuration and permissions
2. **Performance issues**: Adjust buffer size and flush intervals
3. **Disk space**: Configure proper log rotation and retention
4. **Database errors**: Check connection strings and permissions

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
const logger = createLogger({
  defaultLevel: 'debug',
  destinations: [{
    type: 'console',
    enabled: true,
    level: 'debug'
  }]
});
```

## Support

For issues and questions:
1. Check this documentation
2. Review example usage in `examples/UsageExample.ts`
3. Examine integration with sandbox in `../sandbox.ts`
4. Check system health with `logManager.healthCheck()`

---

This logging system provides comprehensive monitoring and auditing capabilities suitable for enterprise environments with strict security and compliance requirements.