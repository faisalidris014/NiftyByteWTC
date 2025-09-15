# Offline Queue System Documentation

## Overview

The Offline Queue System is a robust, encrypted storage and synchronization mechanism designed for the Windows Troubleshooting Companion application. It enables reliable data persistence and synchronization with external ITSM systems (ServiceNow, Jira, Zendesk, Salesforce) even when network connectivity is intermittent or unavailable.

**Key Features:**
- Encrypted SQLite database storage
- Automatic retry with exponential backoff
- Priority-based queue management
- Size and item count limits
- Background synchronization
- Comprehensive monitoring and statistics
- Support for multiple item types (tickets, feedback, logs)

## Architecture

### System Components

```
Offline Queue System Architecture:
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│                  OfflineQueue (Facade)                      │
├─────────────────────────────────────────────────────────────┤
│  EncryptedDatabase  │   Sync Adapters   │   Queue Manager   │
├─────────────────────────────────────────────────────────────┤
│                    SQLite Database                         │
└─────────────────────────────────────────────────────────────┘
```

### Component Relationships

1. **OfflineQueue**: Main facade class providing public API for queue operations
2. **EncryptedDatabase**: Handles database operations with AES-256-CBC encryption
3. **Sync Adapters**: Platform-specific integration with ITSM systems
4. **SQLite Database**: Persistent storage with WAL mode for performance

### Data Flow

1. **Enqueue**: Application → OfflineQueue → EncryptedDatabase → SQLite
2. **Sync**: Background task → OfflineQueue → Sync Adapter → External API
3. **Retry**: Failed sync → Exponential backoff → Requeue for retry
4. **Cleanup**: Background task → Remove old/completed items

## API Documentation

### OfflineQueue Class

#### Constructor
```typescript
constructor(config: Partial<QueueConfig> = {})
```
Initializes the queue with optional configuration overrides.

#### Public Methods

##### Enqueue Operations
```typescript
enqueueTicket(ticketData: TicketQueueItem['ticketData'], destination: TicketQueueItem['destination']): Promise<string>
```
Adds a support ticket to the queue. Returns the generated item ID.

```typescript
enqueueFeedback(feedbackData: FeedbackQueueItem['feedbackData']): Promise<string>
```
Adds user feedback to the queue. Returns the generated item ID.

```typescript
enqueueLog(logData: LogQueueItem['logData']): Promise<string>
```
Adds a log entry to the queue. Returns the generated item ID.

##### Retrieval Operations
```typescript
getItem(id: string): Promise<QueueItem | null>
```
Retrieves a specific queue item by ID.

```typescript
getPendingItems(limit?: number): Promise<QueueItem[]>
```
Retrieves pending items ready for synchronization.

```typescript
getRetryingItems(limit?: number): Promise<QueueItem[]>
```
Retrieves items scheduled for retry.

##### Management Operations
```typescript
updateItemStatus(id: string, status: QueueItem['status'], error?: string): Promise<void>
```
Updates the status of a queue item.

```typescript
scheduleRetry(id: string, error: string): Promise<void>
```
Schedules an item for retry with exponential backoff.

```typescript
getStats(): Promise<QueueStats>
```
Returns comprehensive queue statistics.

```typescript
cleanupOldItems(): Promise<void>
```
Removes completed and failed items based on retention policies.

##### Synchronization Operations
```typescript
attemptSync(): Promise<SyncStatus>
```
Attempts to synchronize all pending and retrying items.

```typescript
getSyncStatus(): Promise<SyncStatus>
```
Returns the current synchronization status.

##### Utility Operations
```typescript
clearQueue(): Promise<void>
```
Clears all items from the queue (use with caution).

```typescript
close(): Promise<void>
```
Gracefully shuts down the queue system.

```typescript
exportQueue(): Promise<QueueItem[]>
```
Exports all queue items for backup or migration.

```typescript
importQueue(items: QueueItem[]): Promise<void>
```
Imports queue items from backup or migration.

### QueueItem Types

#### TicketQueueItem
```typescript
interface TicketQueueItem extends QueueItemBase {
  type: 'ticket';
  ticketData: {
    summary: string;
    description: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    user: {
      id: string;
      name: string;
      email?: string;
    };
    systemInfo: {
      osVersion: string;
      architecture: string;
      deviceName: string;
    };
    skillResults: Array<{
      skillId: string;
      status: 'success' | 'error' | 'timeout';
      output?: string;
      executionTimeMs: number;
    }>;
    attachments?: Array<{
      name: string;
      type: string;
      size: number;
      content: string; // base64 encoded
    }>;
  };
  destination: {
    type: 'servicenow' | 'jira' | 'zendesk' | 'salesforce';
    config: Record<string, any>;
  };
}
```

#### FeedbackQueueItem
```typescript
interface FeedbackQueueItem extends QueueItemBase {
  type: 'feedback';
  feedbackData: {
    rating: number;
    comment: string;
    userId: string;
    userName: string;
    skillId?: string;
    context: Record<string, any>;
  };
}
```

#### LogQueueItem
```typescript
interface LogQueueItem extends QueueItemBase {
  type: 'log';
  logData: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    message: string;
    timestamp: number;
    component: string;
    skillId?: string;
    executionId?: string;
    correlationId?: string;
    context?: Record<string, any>;
    error?: {
      message: string;
      stack?: string;
      code?: string;
    };
  };
}
```

### QueueConfig Interface
```typescript
interface QueueConfig {
  maxTicketItems: number;          // Maximum ticket items (default: 20)
  maxFeedbackItems: number;        // Maximum feedback items (default: 100)
  maxLogSizeBytes: number;         // Maximum log storage (default: 50MB)
  maxRetryAttempts: number;        // Maximum retry attempts (default: 5)
  retryBackoffMs: number;          // Base retry backoff (default: 30s)
  retryJitterMs: number;           // Retry jitter (default: 5s)
  cleanupIntervalMs: number;       // Cleanup interval (default: 1h)
  syncIntervalMs: number;          // Sync interval (default: 30s)
  encryptionKey: string;           // Encryption key
  databasePath: string;            // Database file path
}
```

## Configuration

### Default Configuration
```typescript
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxTicketItems: 20,
  maxFeedbackItems: 100,
  maxLogSizeBytes: 50 * 1024 * 1024, // 50MB
  maxRetryAttempts: 5,
  retryBackoffMs: 30000,             // 30 seconds
  retryJitterMs: 5000,               // 5 seconds jitter
  cleanupIntervalMs: 3600000,        // 1 hour
  syncIntervalMs: 30000,             // 30 seconds
  encryptionKey: process.env.OFFLINE_QUEUE_ENCRYPTION_KEY || 'default-insecure-key-change-in-production',
  databasePath: process.env.OFFLINE_QUEUE_DB_PATH || './data/offline-queue.db'
};
```

### Environment Variables

- `OFFLINE_QUEUE_ENCRYPTION_KEY`: Encryption key for database security
- `OFFLINE_QUEUE_DB_PATH`: Path to SQLite database file

### Custom Configuration
```typescript
import { OfflineQueue, DEFAULT_QUEUE_CONFIG } from './offline-queue';

const customConfig = {
  ...DEFAULT_QUEUE_CONFIG,
  maxTicketItems: 50,
  syncIntervalMs: 60000, // 1 minute
  encryptionKey: 'your-secure-encryption-key-here'
};

const queue = new OfflineQueue(customConfig);
```

## Usage Examples

### Basic Initialization
```typescript
import { OfflineQueue } from './offline-queue';

// Initialize with default configuration
const queue = new OfflineQueue();

// Initialize with custom configuration
const customQueue = new OfflineQueue({
  maxTicketItems: 50,
  syncIntervalMs: 60000,
  encryptionKey: process.env.ENCRYPTION_KEY
});
```

### Enqueueing Items
```typescript
// Enqueue a support ticket
const ticketId = await queue.enqueueTicket({
  summary: 'Network connectivity issues',
  description: 'User cannot connect to corporate WiFi',
  category: 'networking',
  severity: 'high',
  user: {
    id: 'user-123',
    name: 'John Doe',
    email: 'john.doe@company.com'
  },
  systemInfo: {
    osVersion: 'Windows 11 22H2',
    architecture: 'x64',
    deviceName: 'LAPTOP-12345'
  },
  skillResults: [
    {
      skillId: 'network-diagnostics',
      status: 'error',
      output: 'DNS resolution failed',
      executionTimeMs: 1500
    }
  ]
}, {
  type: 'servicenow',
  config: {
    instance: 'company',
    username: 'api_user',
    password: 'api_password'
  }
});

// Enqueue user feedback
const feedbackId = await queue.enqueueFeedback({
  rating: 4,
  comment: 'Very helpful troubleshooting experience',
  userId: 'user-123',
  userName: 'John Doe',
  skillId: 'network-diagnostics'
});

// Enqueue application log
const logId = await queue.enqueueLog({
  level: 'error',
  message: 'Failed to execute network diagnostics skill',
  timestamp: Date.now(),
  component: 'skill-engine',
  skillId: 'network-diagnostics',
  error: {
    message: 'DNS resolution timeout',
    stack: 'Error: Timeout...'
  }
});
```

### Retrieving Queue Status
```typescript
// Get comprehensive statistics
const stats = await queue.getStats();
console.log(`Pending items: ${stats.pending}`);
console.log(`Total size: ${stats.totalSizeBytes} bytes`);

// Get synchronization status
const syncStatus = await queue.getSyncStatus();
console.log(`Online: ${syncStatus.isOnline}`);
console.log(`Last sync: ${new Date(syncStatus.lastSyncTime || 0).toLocaleString()}`);

// Get specific items
const pendingItems = await queue.getPendingItems(10); // First 10 pending items
const retryingItems = await queue.getRetryingItems(); // All retrying items
```

### Manual Synchronization
```typescript
// Force synchronization
const syncResult = await queue.attemptSync();
if (syncResult.itemsSynced > 0) {
  console.log(`Successfully synced ${syncResult.itemsSynced} items`);
} else if (syncResult.syncError) {
  console.error(`Sync failed: ${syncResult.syncError}`);
}
```

### Error Handling
```typescript
try {
  await queue.enqueueTicket(ticketData, destination);
} catch (error) {
  if (error.message.includes('QUEUE_FULL')) {
    console.warn('Queue is full, cannot add more tickets');
    // Handle queue full scenario
  } else {
    console.error('Failed to enqueue ticket:', error);
  }
}
```

## Security Considerations

### Encryption
- All queue items are encrypted using AES-256-CBC encryption
- Encryption key derivation uses SHA-256 for consistent key length
- Each item has a unique initialization vector (IV)
- Encryption occurs before storage in SQLite database

### Secure Configuration
```typescript
// Always use environment variables for sensitive configuration
const secureConfig = {
  ...DEFAULT_QUEUE_CONFIG,
  encryptionKey: process.env.OFFLINE_QUEUE_ENCRYPTION_KEY,
  databasePath: process.env.OFFLINE_QUEUE_DB_PATH || '/secure/location/queue.db'
};
```

### Best Practices

1. **Key Management**:
   - Never hardcode encryption keys in source code
   - Use secure key management systems
   - Rotate keys periodically
   - Store keys in environment variables or secure config stores

2. **Database Security**:
   - Store database files in secure locations
   - Set appropriate file permissions
   - Regularly backup database files
   - Monitor database size and performance

3. **Network Security**:
   - Use HTTPS for all external API calls
   - Validate SSL certificates
   - Implement proper authentication for ITSM systems
   - Use API tokens instead of passwords when possible

4. **Data Retention**:
   - Configure appropriate cleanup intervals
   - Remove sensitive data when no longer needed
   - Follow organizational data retention policies

### Security Audit Points

- [ ] Encryption key is not hardcoded
- [ ] Database file permissions are secure
- [ ] API credentials are properly secured
- [ ] SSL certificate validation is enabled
- [ ] Error messages don't expose sensitive information
- [ ] Log files don't contain sensitive data

## Troubleshooting

### Common Issues

#### Queue Full Errors
**Symptom**: `QUEUE_FULL` error when enqueueing items
**Solution**:
- Increase queue size limits in configuration
- Implement automatic cleanup of old items
- Check if cleanup tasks are running properly

```typescript
// Check current queue status
const stats = await queue.getStats();
if (stats.totalSizeBytes > config.maxLogSizeBytes) {
  await queue.cleanupOldItems();
}
```

#### Synchronization Failures
**Symptom**: Items remain in pending/retrying state
**Solution**:
- Check network connectivity
- Verify ITSM system credentials
- Review sync adapter configuration
- Check for API rate limiting

```typescript
// Test connection to ITSM system
const adapter = new ServiceNowAdapter(serviceNowConfig);
const isConnected = await adapter.testConnection();
if (!isConnected) {
  // Handle connection issues
}
```

#### Database Corruption
**Symptom**: Database operations fail with SQL errors
**Solution**:
- Use built-in repair functionality
- Restore from backup if available
- Implement regular database maintenance

```typescript
// Check and repair database
if (db.isCorrupted()) {
  db.repair();
  console.log('Database repaired successfully');
}
```

#### Performance Issues
**Symptom**: Slow queue operations or high memory usage
**Solution**:
- Compact database regularly
- Monitor queue statistics
- Optimize sync intervals
- Review item size calculations

```typescript
// Compact database to improve performance
db.compact();

// Monitor performance metrics
const dbStats = db.getStats();
console.log(`Database size: ${dbStats.sizeBytes} bytes`);
```

### Error Codes

| Error Code | Description | Recommended Action |
|------------|-------------|-------------------|
| `QUEUE_DATABASE_ERROR` | Database operation failed | Check database file permissions and integrity |
| `QUEUE_ENCRYPTION_ERROR` | Encryption failed | Verify encryption key configuration |
| `QUEUE_DECRYPTION_ERROR` | Decryption failed | Check for data corruption or key mismatch |
| `QUEUE_FULL` | Queue size limits exceeded | Cleanup old items or increase limits |
| `QUEUE_ITEM_NOT_FOUND` | Item not found in queue | Verify item ID and queue contents |
| `QUEUE_INVALID_ITEM` | Invalid item structure | Validate item data before enqueueing |
| `QUEUE_MAX_RETRIES_EXCEEDED` | Maximum retry attempts reached | Investigate persistent sync failures |
| `QUEUE_SYNC_FAILED` | Synchronization failed | Check network and ITSM system status |
| `QUEUE_CONNECTION_ERROR` | Network connection error | Verify network connectivity and proxy settings |

### Debugging

Enable detailed logging for troubleshooting:

```typescript
// Enable debug logging
process.env.DEBUG = 'offline-queue:*';

// Or use custom logging
const queue = new OfflineQueue({
  // ... config
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`)
  }
});
```

## Integration

### ITSM System Integration

The offline queue system includes built-in adapters for popular ITSM platforms:

#### ServiceNow Integration
```typescript
import { ServiceNowAdapter, SyncAdapterFactory } from './sync-adapters';

const serviceNowConfig = {
  instance: 'your-instance',
  username: 'api_user',
  password: 'api_password',
  tableName: 'incident',
  apiVersion: 'v1'
};

const adapter = SyncAdapterFactory.createServiceNowAdapter(serviceNowConfig);
```

#### Jira Integration
```typescript
const jiraConfig = {
  baseUrl: 'https://your-company.atlassian.net',
  username: 'user@company.com',
  apiToken: 'your-api-token',
  projectKey: 'PROJ',
  issueType: 'Bug'
};

const adapter = SyncAdapterFactory.createJiraAdapter(jiraConfig);
```

#### Zendesk Integration
```typescript
const zendeskConfig = {
  subdomain: 'your-subdomain',
  email: 'user@company.com',
  apiToken: 'your-api-token',
  ticketFormId: '12345'
};

const adapter = SyncAdapterFactory.createZendeskAdapter(zendeskConfig);
```

#### Salesforce Integration
```typescript
const salesforceConfig = {
  instanceUrl: 'https://your-company.my.salesforce.com',
  accessToken: 'your-access-token',
  objectName: 'Case'
};

const adapter = SyncAdapterFactory.createSalesforceAdapter(salesforceConfig);
```

### Custom Adapter Implementation

Implement the `SyncAdapter` interface for custom integrations:

```typescript
import { SyncAdapter, TicketQueueItem, FeedbackQueueItem } from './types';

class CustomITSMAdapter implements SyncAdapter {
  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    // Implement custom ticket synchronization
  }

  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    // Implement custom feedback synchronization
  }

  async testConnection(): Promise<boolean> {
    // Implement connection testing
    return true;
  }
}
```

### Application Integration

Integrate with the main application:

```typescript
// In main application initialization
import { OfflineQueue } from './offline-queue';

class TroubleshootingApp {
  private queue: OfflineQueue;

  constructor() {
    this.queue = new OfflineQueue({
      encryptionKey: process.env.ENCRYPTION_KEY,
      databasePath: './data/queue.db'
    });
  }

  async handleUserIssue(issueData: any) {
    try {
      // Try immediate sync first
      await this.syncToITSM(issueData);
    } catch (error) {
      // If sync fails, queue for offline processing
      const ticketId = await this.queue.enqueueTicket(issueData, {
        type: 'servicenow',
        config: serviceNowConfig
      });

      console.log(`Queued ticket ${ticketId} for offline processing`);
    }
  }

  async shutdown() {
    await this.queue.close();
  }
}
```

## Performance

### Performance Characteristics

- **Enqueue Operations**: ~5-10ms per item
- **Sync Operations**: ~100-500ms per item (depends on network)
- **Database Operations**: ~1-5ms for most queries
- **Memory Usage**: ~10-50MB depending on queue size
- **Storage Usage**: Configurable with size limits

### Optimization Tips

1. **Batch Operations**:
   ```typescript
   // Process multiple items in batch
   const items = await queue.getPendingItems(50);
   await processItemsInBatch(items);
   ```

2. **Database Maintenance**:
   ```typescript
   // Regular maintenance
   setInterval(() => {
     db.compact();
     queue.cleanupOldItems();
   }, 24 * 60 * 60 * 1000); // Daily
   ```

3. **Memory Management**:
   ```typescript
   // Limit concurrent operations
   const MAX_CONCURRENT_SYNC = 5;
   const semaphore = new Semaphore(MAX_CONCURRENT_SYNC);
   ```

4. **Network Optimization**:
   ```typescript
   // Implement connection pooling
   // Use keep-alive connections
   // Compress large payloads
   ```

### Monitoring

Implement monitoring for key metrics:

```typescript
// Monitor queue health
setInterval(async () => {
  const stats = await queue.getStats();
  const syncStatus = await queue.getSyncStatus();

  monitor.gauge('queue.size', stats.totalItems);
  monitor.gauge('queue.pending', stats.pending);
  monitor.gauge('queue.size_bytes', stats.totalSizeBytes);
  monitor.gauge('sync.success_rate',
    syncStatus.itemsSynced / (syncStatus.itemsSynced + syncStatus.itemsFailed) || 0
  );
}, 60000); // Every minute
```

## Maintenance

### Routine Maintenance Procedures

#### Daily Tasks
1. **Check Queue Status**: Monitor queue size and pending items
2. **Verify Sync Health**: Review synchronization success rates
3. **Database Backup**: Create daily backups of queue database
4. **Log Review**: Check for errors or warnings in application logs

#### Weekly Tasks
1. **Database Compaction**: Compact SQLite database to reclaim space
2. **Performance Review**: Analyze queue performance metrics
3. **Security Audit**: Review encryption and access controls
4. **Configuration Review**: Verify queue configuration settings

#### Monthly Tasks
1. **Encryption Key Rotation**: Rotate encryption keys (if supported)
2. **Storage Cleanup**: Review and purge old queue data
3. **Version Upgrade**: Check for updates to queue system components
4. **Capacity Planning**: Review queue size trends and plan for growth

### Monitoring Procedures

#### Key Metrics to Monitor
- Queue size (items and bytes)
- Pending item count
- Synchronization success rate
- Average sync duration
- Retry attempt counts
- Database size and performance

#### Alert Thresholds
```yaml
queue:
  size_warning: 1000 items
  size_critical: 2000 items
  pending_warning: 100 items
  pending_critical: 200 items
  sync_failure_rate_warning: 10%
  sync_failure_rate_critical: 25%
  retry_count_warning: 3 attempts
  retry_count_critical: 5 attempts
```

### Backup and Recovery

#### Backup Procedures
```typescript
// Manual backup
const backupPath = `./backups/queue-${Date.now()}.db`;
db.backup(backupPath);

// Automated backup schedule
setInterval(() => {
  const backupPath = `./backups/queue-${new Date().toISOString().split('T')[0]}.db`;
  db.backup(backupPath);
}, 24 * 60 * 60 * 1000); // Daily
```

#### Recovery Procedures
1. **Identify Corruption**: Use `db.isCorrupted()` to check database health
2. **Restore Backup**: Replace corrupted database with latest backup
3. **Reinitialize**: Create new database if no backup available
4. **Verify Integrity**: Check queue consistency after recovery

### Database Maintenance

#### Compaction
```typescript
// Manual compaction
db.compact();

// Scheduled compaction
setInterval(() => {
  db.compact();
}, 7 * 24 * 60 * 60 * 1000); // Weekly
```

#### Integrity Checking
```typescript
// Check database integrity
const integrityCheck = db.prepare('PRAGMA integrity_check').get();
if (integrityCheck.integrity_check !== 'ok') {
  console.warn('Database integrity issues detected');
  db.repair();
}
```

### Logging and Auditing

#### Audit Log Configuration
```typescript
// Configure comprehensive logging
const queue = new OfflineQueue({
  // ... config
  logging: {
    level: 'info', // 'debug', 'info', 'warn', 'error'
    file: './logs/queue.log',
    maxSize: '10m',
    maxFiles: '7d'
  }
});
```

#### Audit Trail
Maintain audit trail for:
- Item creation and modification
- Synchronization attempts and results
- Configuration changes
- Security-related events
- Error conditions and resolutions

### Security Maintenance

#### Regular Security Tasks
1. **Key Rotation**: Periodically rotate encryption keys
2. **Access Review**: Review database file permissions
3. **Audit Log Review**: Review security-related log entries
4. **Vulnerability Scanning**: Scan for known vulnerabilities in dependencies

#### Incident Response
1. **Detection**: Monitor for security incidents
2. **Containment**: Isolate affected systems
3. **Eradication**: Remove security threats
4. **Recovery**: Restore normal operations
5. **Post-Incident Review**: Analyze and improve security measures

---

*This documentation covers the comprehensive offline queue system implementation. For additional support, refer to the source code comments or contact the development team.*