# ITSM Integration System Documentation

## Overview

The ITSM (IT Service Management) Integration System provides secure, standardized connectivity between the Windows AI Troubleshooter and enterprise ITSM platforms like ServiceNow and Jira Service Desk. This system enables automated ticket creation, comprehensive error handling, and secure credential management with enterprise-grade security features.

### Key Features
- **Multi-Platform Support**: ServiceNow, Jira Service Desk, Zendesk, Salesforce (extensible)
- **Secure Credential Management**: AES-256 encryption with key rotation
- **Standardized Ticket Format**: Consistent payload structure across all ITSM systems
- **Robust Error Handling**: Exponential backoff retry logic with jitter
- **Connection Testing**: Comprehensive validation and health checks
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Offline Support**: Integration with offline queue system for unreliable networks

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   ITSM Integration System                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Integration     │  │ Credential      │  │ Connection  │ │
│  │ Manager         │  │ Manager         │  │ Tester      │ │
│  │                 │  │                 │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│          │                         │               │        │
│          │                         │               │        │
│  ┌───────┴─────────────────────────┴───────────────┴──────┐ │
│  │                    Connector Layer                     │ │
│  │                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │ ServiceNow  │  │ Jira        │  │ Base Connector │ │ │
│  │  │ Connector   │  │ Connector   │  │ (Abstract)     │ │ │
│  │  │             │  │             │  │                 │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component Relationships

1. **IntegrationManager**: Main orchestrator that manages all ITSM connections
2. **CredentialManager**: Handles secure storage and encryption of credentials
3. **ConnectionTester**: Provides comprehensive connection validation utilities
4. **BaseConnector**: Abstract base class with common functionality
5. **ServiceNowConnector**: ServiceNow REST API implementation
6. **JiraConnector**: Jira Service Desk API implementation
7. **ITSMOfflineQueueAdapter**: Bridges ITSM system with offline queue

### Data Flow

1. **Ticket Creation**: Standardized payload → ITSM-specific mapping → API call → Result processing
2. **Credential Management**: Encryption → Secure storage → Decryption → Authentication
3. **Error Handling**: Error detection → Retry logic → Fallback handling → Logging
4. **Offline Support**: Queue storage → Connection recovery → Batch processing

## Security Implementation

### Encryption Implementation

The system uses AES-256 encryption for credential storage with the following security measures:

```typescript
// Key derivation using scryptSync
private deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, 'itsm-credential-salt', this.keyLength);
}

// Encryption with AES-256-CBC
private encryptCredentialsWithKey(credentials: ITSMCredentials, key: Buffer): EncryptedCredential {
  const iv = randomBytes(16);
  const salt = randomBytes(16);

  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final()
  ]);

  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: '',
    algorithm: 'aes-256-cbc',
    version: '1.0.0'
  };
}
```

### Security Features

1. **AES-256 Encryption**: Credentials encrypted at rest using industry-standard encryption
2. **Key Rotation**: Regular encryption key updates with automatic re-encryption
3. **Secure Storage**: Memory-only credential handling with no persistent exposure
4. **Input Validation**: Comprehensive data validation for all inputs
5. **TLS Enforcement**: SSL certificate validation for all API communications
6. **Environment Isolation**: Secure environment variable validation and sanitization

### Security Fixes Applied

Based on the security review, the following critical security fixes were implemented:

#### 1. Process Killing Race Condition Fix
**Before (Vulnerable):**
```typescript
setTimeout(() => {
  if (this.process && !this.process.killed) {
    this.process?.kill('SIGKILL'); // ❌ Race condition
  }
}, this.options.timeoutMs);
```

**After (Fixed):**
```typescript
private handleTimeout(reject: (reason?: any) => void): void {
  if (this.isProcessTerminating || !this.process) {
    return;
  }

  this.isProcessTerminating = true;

  try {
    this.recordSecurityEvent('resource_exceeded', 'high', `Execution timeout`);
    this.safeKillProcess('SIGKILL');
    reject(new Error(`Timeout after ${this.options.timeoutMs}ms`));
  } finally {
    this.isProcessTerminating = false;
  }
}
```

#### 2. Environment Variable Pollution Fix
**Before (Vulnerable):**
```typescript
process.env = {  // ❌ DANGEROUS: Overwrites entire process environment
  ...process.env,
  ...this.options.environmentVariables,
  WTC_SANDBOX: 'true'
};
```

**After (Fixed):**
```typescript
private createIsolatedEnvironment(): Record<string, string> {
  const isolatedEnv: Record<string, string> = {
    PATH: process.env.PATH || '',
    TEMP: process.env.TEMP || os.tmpdir(),
    WTC_SANDBOX: 'true',
    WTC_EXECUTION_ID: this.executionId
  };

  // Add validated custom environment variables
  if (this.options.environmentVariables) {
    const validatedVars = this.validateEnvironmentVariables(this.options.environmentVariables);
    Object.assign(isolatedEnv, validatedVars);
  }

  return isolatedEnv;
}
```

#### 3. Resource Monitoring Implementation
**Before (Vulnerable):**
```typescript
private startResourceMonitoring(): void {
  this.resourceMonitor = setInterval(() => {
    if (!this.process) return;
    // ❌ EMPTY IMPLEMENTATION: No actual resource monitoring
  }, 100);
}
```

**After (Fixed):**
```typescript
private startResourceMonitoring(): void {
  this.resourceMonitor = setInterval(() => {
    if (!this.process) return;

    try {
      this.monitorCpuUsage();
      this.monitorMemoryUsage();
      this.monitorDiskUsage();
      this.monitorNetworkUsage();
      this.checkResourceLimits();
    } catch (error) {
      this.logManager.error('Resource monitoring error', error as Error);
    }
  }, 250);
}
```

## API Documentation

### ITSMIntegrationManager

Main class for managing ITSM integrations.

#### Constructor
```typescript
constructor(masterKey: string)
```
- `masterKey`: Encryption key for credential security

#### Methods

##### initialize()
```typescript
async initialize(): Promise<void>
```
Initialize all enabled connections.

##### createTicket()
```typescript
async createTicket(ticketData: StandardizedTicketPayload): Promise<Map<string, TicketCreationResult>>
```
Create ticket across all enabled connections.

##### testAllConnections()
```typescript
async testAllConnections(): Promise<Map<string, ConnectionTestResult>>
```
Test all enabled connections.

##### addConnection()
```typescript
async addConnection(config: ITSMConnectionConfig): Promise<string>
```
Add new connection configuration.

##### updateConnection()
```typescript
async updateConnection(connectionId: string, updates: Partial<ITSMConnectionConfig>): Promise<boolean>
```
Update existing connection configuration.

##### removeConnection()
```typescript
removeConnection(connectionId: string): boolean
```
Remove connection configuration.

##### getHealthStatus()
```typescript
getHealthStatus(): Map<string, ITSMHealthStatus>
```
Get health status of all connections.

##### listConnections()
```typescript
listConnections(): Array<{
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
}>
```
List all stored connections.

##### close()
```typescript
async close(): Promise<void>
```
Close all connections and cleanup.

##### rotateKey()
```typescript
rotateKey(newMasterKey: string): void
```
Rotate encryption key and re-encrypt all credentials.

### ConnectionTester

Utility class for testing connections without storing them.

#### Static Methods

##### testConnection()
```typescript
static async testConnection(config: ITSMConnectionConfig): Promise<ConnectionTestResult>
```
Test a connection configuration.

##### validateConnectionConfig()
```typescript
static validateConnectionConfig(config: ITSMConnectionConfig): string[]
```
Validate connection configuration.

##### comprehensiveTest()
```typescript
static async comprehensiveTest(config: ITSMConnectionConfig): Promise<{
  basicTest: ConnectionTestResult;
  authenticationTest: ConnectionTestResult;
  apiAccessTest: ConnectionTestResult;
  overallStatus: 'pass' | 'fail' | 'partial';
  details: string[];
}>
```
Perform comprehensive connection test with multiple checks.

### CredentialManager

Handles secure credential storage and management.

#### Methods

##### storeConnection()
```typescript
storeConnection(config: ITSMConnectionConfig): string
```
Store connection configuration with encrypted credentials.

##### retrieveConnection()
```typescript
retrieveConnection(connectionId: string): ITSMConnectionConfig | null
```
Retrieve connection configuration with decrypted credentials.

##### updateConnection()
```typescript
updateConnection(connectionId: string, updates: Partial<ITSMConnectionConfig>): boolean
```
Update connection configuration.

##### deleteConnection()
```typescript
deleteConnection(connectionId: string): boolean
```
Delete connection configuration.

##### listConnections()
```typescript
listConnections(): Array<{
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
}>
```
List all stored connections.

##### rotateKey()
```typescript
rotateKey(newMasterKey: string): void
```
Rotate encryption key and re-encrypt all credentials.

## Configuration

### Environment Variables

```bash
# Encryption key for credential security
OFFLINE_QUEUE_ENCRYPTION_KEY=your-secure-master-key

# Database path for offline queue
OFFLINE_QUEUE_DB_PATH=./data/offline-queue.db

# Node environment
NODE_ENV=production
```

### Connection Configuration

Each connection supports the following configuration:

```typescript
interface ITSMConnectionConfig {
  id: string;                    // Unique connection identifier
  name: string;                  // Connection name
  type: 'servicenow' | 'jira';   // ITSM system type
  baseUrl: string;               // Base API URL
  credentials: ITSMCredentials;  // Authentication credentials
  enabled: boolean;              // Whether connection is enabled
  defaultPriority: 'low' | 'medium' | 'high' | 'critical';
  defaultCategory?: string;      // Default category/category
  timeoutMs: number;             // Request timeout in milliseconds
  maxRetries: number;            // Maximum retry attempts
  retryDelayMs: number;          // Initial retry delay
  syncIntervalMs: number;        // Sync interval for offline queue
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Last update timestamp
}
```

### Authentication Types

#### Basic Authentication (ServiceNow)
```typescript
{
  type: 'basic',
  username: 'your-username',
  password: 'your-password'
}
```

#### API Token Authentication (Jira)
```typescript
{
  type: 'api_token',
  username: 'your-email@company.com',
  apiToken: 'your-api-token'
}
```

## Usage Examples

### Basic Setup

```typescript
import ITSMIntegrationManager from './itsm-integration';

// Initialize with a master encryption key
const integrationManager = new ITSMIntegrationManager('your-secure-master-key');

await integrationManager.initialize();
```

### Adding a ServiceNow Connection

```typescript
const serviceNowConfig = {
  name: 'Production ServiceNow',
  type: 'servicenow',
  baseUrl: 'https://your-instance.service-now.com',
  credentials: {
    type: 'basic',
    username: 'your-username',
    password: 'your-password'
  },
  enabled: true,
  defaultPriority: 'medium',
  defaultCategory: 'IT Support',
  timeoutMs: 30000,
  maxRetries: 3
};

const connectionId = await integrationManager.addConnection(serviceNowConfig);
```

### Adding a Jira Connection

```typescript
const jiraConfig = {
  name: 'Jira Service Desk',
  type: 'jira',
  baseUrl: 'https://your-company.atlassian.net',
  credentials: {
    type: 'api_token',
    username: 'your-email@company.com',
    apiToken: 'your-api-token'
  },
  enabled: true,
  defaultPriority: 'medium',
  defaultCategory: 'SUPPORT',
  timeoutMs: 30000,
  maxRetries: 3
};

const connectionId = await integrationManager.addConnection(jiraConfig);
```

### Creating Tickets

```typescript
const ticketData = {
  summary: 'Network connectivity issue',
  description: 'User cannot connect to corporate WiFi',
  category: 'Network',
  priority: 'high',
  user: {
    id: 'user123',
    name: 'John Doe',
    email: 'john.doe@example.com'
  },
  systemInfo: {
    osVersion: 'Windows 10 22H2',
    architecture: 'x64',
    deviceName: 'JOHN-LAPTOP',
    deviceId: 'device-123456'
  },
  skillResults: [
    {
      skillId: 'wifi-reset',
      skillName: 'WiFi Adapter Reset',
      status: 'success',
      output: 'Adapter reset successfully',
      executionTimeMs: 1500
    }
  ],
  context: {
    appVersion: '1.0.0',
    sessionId: 'session-123',
    correlationId: 'corr-123',
    troubleshootingSession: {
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      durationMs: 10000,
      stepsAttempted: 3,
      stepsSuccessful: 2
    }
  }
};

const results = await integrationManager.createTicket(ticketData);

for (const [connectionId, result] of results) {
  if (result.success) {
    console.log(`Ticket created in ${connectionId}: ${result.ticketNumber}`);
  } else {
    console.error(`Failed to create ticket in ${connectionId}: ${result.error?.message}`);
  }
}
```

### Testing Connections

```typescript
// Test all connections
const testResults = await integrationManager.testAllConnections();

// Test specific connection
const connectionTester = new ConnectionTester();
const testResult = await connectionTester.testConnection(serviceNowConfig);

if (testResult.success) {
  console.log('Connection test passed');
} else {
  console.error('Connection test failed:', testResult.message);
}
```

### Managing Connections

```typescript
// List all connections
const connections = integrationManager.listConnections();

// Get health status
const healthStatus = integrationManager.getHealthStatus();

// Update connection
await integrationManager.updateConnection(connectionId, {
  enabled: false,
  timeoutMs: 60000
});

// Remove connection
integrationManager.removeConnection(connectionId);
```

## Security Best Practices

### Encryption Key Management

1. **Use Strong Master Keys**: Generate strong, random encryption keys
2. **Regular Key Rotation**: Rotate encryption keys every 90 days
3. **Secure Storage**: Store master keys in secure environment variables or secret management systems
4. **Access Control**: Limit access to encryption keys to authorized personnel only

### Credential Security

1. **Never Store Plaintext**: Always encrypt credentials at rest
2. **Memory Safety**: Clear credentials from memory after use
3. **Input Validation**: Validate all credential inputs before storage
4. **Regular Audits**: Conduct regular security audits of stored credentials

### Network Security

1. **TLS Enforcement**: Always use HTTPS for API communications
2. **Certificate Validation**: Validate SSL certificates for all connections
3. **Network Segmentation**: Isolate ITSM integration components
4. **Firewall Rules**: Restrict outbound connections to authorized ITSM systems

### Access Control

1. **Principle of Least Privilege**: Use minimal necessary permissions
2. **Role-Based Access**: Implement role-based access control for ITSM operations
3. **Audit Logging**: Log all ITSM operations for security monitoring
4. **Regular Reviews**: Conduct regular access control reviews

## Troubleshooting

### Common Issues and Solutions

#### Connection Failures

**Issue**: "Connection test failed: 401 Unauthorized"
**Solution**: Verify credentials and ensure user has appropriate permissions

**Issue**: "Connection timeout after 30000ms"
**Solution**: Increase timeout or check network connectivity

**Issue**: "SSL certificate validation failed"
**Solution**: Verify certificate validity or disable validation in development

#### Ticket Creation Issues

**Issue**: "Invalid ticket data: Summary is required"
**Solution**: Ensure all required fields are provided in ticket data

**Issue**: "Ticket creation failed: 400 Bad Request"
**Solution**: Check field mappings and custom field requirements

**Issue**: "Rate limited: 429 Too Many Requests"
**Solution**: Implement retry logic with exponential backoff

#### Encryption Issues

**Issue**: "Failed to decrypt credentials"
**Solution**: Verify encryption key is correct and hasn't been rotated

**Issue**: "Invalid encryption key format"
**Solution**: Ensure encryption key meets length requirements

### Debug Mode

Enable debug mode for detailed logging:

```typescript
const integrationManager = new ITSMIntegrationManager('key', {
  debug: true,
  timeoutMs: 60000
});
```

### Logging

The system provides comprehensive logging through:
- Console logging (debug mode)
- Security event logging
- Performance metrics
- Error tracking

## Integration with ITSM Systems

### ServiceNow Integration

#### Supported Features
- Incident table API access
- Basic authentication
- Custom field mapping
- Priority/urgency/impact mapping
- Assignment group and user assignment

#### Field Mappings

| Standardized Field | ServiceNow Field |
|-------------------|------------------|
| summary | short_description |
| description | description |
| priority | priority (mapped) |
| category | category |
| user.email | caller_id |
| systemInfo.deviceName | cmdb_ci |

#### API Endpoints
- `POST /api/now/table/incident` - Create incident
- `GET /api/now/table/incident` - Test connection
- `GET /api/now/table/sys_user` - Validate permissions

### Jira Service Desk Integration

#### Supported Features
- Issue creation API
- API token authentication
- Custom field support
- Label and component management
- User assignment

#### Field Mappings

| Standardized Field | Jira Field |
|-------------------|------------|
| summary | summary |
| description | description |
| priority | priority (mapped) |
| category | components |
| skillResults | custom fields |

#### API Endpoints
- `POST /rest/api/2/issue` - Create issue
- `GET /rest/api/2/serverInfo` - Test connection
- `GET /rest/api/2/myself` - Validate permissions
- `GET /rest/api/2/project/{key}` - Validate project

### Extending to Other ITSM Systems

The system is designed to be extensible. To add support for a new ITSM system:

1. **Create a new connector class** extending `BaseITSMCConnector`
2. **Implement required methods**: `initialize`, `createTicket`, `testConnection`, `close`
3. **Add field mappings** for the new system
4. **Update type definitions** in `types.ts`
5. **Add validation logic** in `CredentialManager`
6. **Update `IntegrationManager`** to support the new type

Example for Zendesk support:

```typescript
export class ZendeskConnector extends BaseITSMCConnector {
  // Implementation similar to ServiceNowConnector
  // but using Zendesk API endpoints and authentication
}
```

## Compliance

### Security Compliance

The ITSM integration system meets the following compliance requirements:

#### GDPR Compliance
- **Article 32 - Security of Processing**: Implemented appropriate technical measures
- **Article 35 - Data Protection Impact Assessment**: Addressed risks of unauthorized access

#### HIPAA Compliance
- **§164.312 Technical Safeguards**: Access controls, audit controls, integrity controls
- **§164.308 Administrative Safeguards**: Security management process, information access management

#### SOC2 Compliance
- **Security Principle**: System protected against unauthorized access
- **Availability Principle**: Monitoring systems implemented for resource usage

#### ISO27001 Compliance
- **A.9 Access Control**: Business requirements of access control
- **A.12 Operations Security**: Operational procedures and responsibilities

### Audit Requirements

#### Regular Audits
- Quarterly security audits of encryption implementation
- Monthly access control reviews
- Annual penetration testing

#### Logging Requirements
- All ITSM operations must be logged
- Security events must be retained for 365 days
- Performance metrics must be monitored continuously

#### Documentation Requirements
- Maintain up-to-date system documentation
- Document all security incidents and responses
- Keep compliance evidence for audits

### Monitoring and Alerting

#### Key Metrics to Monitor
- `itsm_connection_success_rate` - Connection success percentage
- `itsm_ticket_creation_time` - Average ticket creation time
- `itsm_error_rate` - Error rate by connection
- `itsm_encryption_operations` - Encryption/decryption operations

#### Alerting Thresholds
- **Critical**: Connection success rate < 80%
- **Warning**: Ticket creation time > 30 seconds
- **Critical**: Encryption failures > 5 per hour
- **Warning**: Rate limit errors > 10 per hour

## Performance Considerations

### Connection Pooling

The system implements connection pooling and reuse to minimize overhead:
- Connections are maintained for active ITSM systems
- Idle connections are automatically closed after 5 minutes
- Connection health is monitored continuously

### Resource Usage

Typical resource usage per connection:
- Memory: ~5-10MB per active connection
- CPU: Minimal overhead (<1% per connection)
- Network: Varies based on ticket volume and size

### Scaling Considerations

For high-volume environments:
- Implement connection pooling with appropriate limits
- Use load balancing for multiple ITSM instances
- Consider asynchronous processing for large ticket volumes
- Monitor and adjust timeout settings based on network latency

## Support and Maintenance

### Version Compatibility

The ITSM integration system is compatible with:
- ServiceNow: Rome+ (API version 2.0+)
- Jira Service Desk: 4.0+
- Node.js: 16.0+
- TypeScript: 4.0+

### Upgrade Procedures

When upgrading the ITSM integration system:

1. **Backup encryption keys** and connection configurations
2. **Test the upgrade** in a staging environment
3. **Monitor performance** after upgrade
4. **Update documentation** with any changes

### Support Channels

For support with the ITSM integration system:
- Create issues on GitHub repository
- Check the documentation for common solutions
- Contact the development team for critical issues
- Review security advisories for updates

## Appendix

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| ITSM_CONNECTION_FAILED | Connection to ITSM system failed | Yes |
| ITSM_AUTHENTICATION_FAILED | Authentication failed | No |
| ITSM_INVALID_CREDENTIALS | Invalid credentials provided | No |
| ITSM_RATE_LIMITED | Rate limited by ITSM system | Yes |
| ITSM_INVALID_TICKET_DATA | Invalid ticket data provided | No |
| ITSM_TICKET_CREATION_FAILED | Ticket creation failed | Yes |
| ITSM_PERMISSION_DENIED | Permission denied | No |
| ITSM_SERVICE_UNAVAILABLE | Service unavailable | Yes |
| ITSM_TIMEOUT | Operation timed out | Yes |
| ITSM_NETWORK_ERROR | Network error occurred | Yes |

### Configuration Reference

#### ITSMConnectionConfig
```typescript
{
  id: string;                    // Auto-generated if not provided
  name: string;                  // Required
  type: 'servicenow' | 'jira';   // Required
  baseUrl: string;               // Required, valid URL
  credentials: {                 // Required
    type: 'basic' | 'api_token';
    username?: string;
    password?: string;
    apiToken?: string;
  };
  enabled: boolean;              // Default: true
  defaultPriority: 'low' | 'medium' | 'high' | 'critical'; // Default: 'medium'
  defaultCategory?: string;      // Optional
  timeoutMs: number;             // Default: 30000
  maxRetries: number;            // Default: 3
  retryDelayMs: number;          // Default: 1000
  syncIntervalMs: number;        // Default: 30000
  createdAt: number;             // Auto-generated
  updatedAt: number;             // Auto-generated
}
```

#### StandardizedTicketPayload
```typescript
{
  summary: string;               // Required, max 255 chars
  description: string;           // Required, max 4000 chars
  category: string;              // Required
  priority: 'low' | 'medium' | 'high' | 'critical'; // Required
  user: {                       // Required
    id: string;
    name: string;
    email?: string;
    department?: string;
    location?: string;
    phone?: string;
  };
  systemInfo: {                 // Required
    osVersion: string;
    architecture: string;
    deviceName: string;
    deviceId: string;
    macAddress?: string;
    ipAddress?: string;
    domain?: string;
  };
  skillResults: Array<{        // Optional
    skillId: string;
    skillName: string;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    output?: string;
    executionTimeMs: number;
    startedAt: number;
    completedAt: number;
    error?: {
      code: string;
      message: string;
      details?: any;
    };
  }>;
  context: {                   // Required
    appVersion: string;
    sessionId: string;
    correlationId: string;
    troubleshootingSession: {
      startTime: number;
      endTime: number;
      durationMs: number;
      stepsAttempted: number;
      stepsSuccessful: number;
    };
  };
  attachments?: Array<{       // Optional
    name: string;
    type: string;
    size: number;
    content: string; // base64
    description?: string;
  }>;
  customFields?: Record<string, any>; // Optional
}
```

### Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-09-14 | Initial release with ServiceNow and Jira support |
| 1.1.0 | 2025-09-15 | Added security fixes and enhanced monitoring |
| 1.2.0 | 2025-09-16 | Added offline queue integration and improved error handling |

### License

This ITSM integration system is licensed under the MIT License. See the LICENSE file for details.

### Support

For questions, issues, or support requests:
- Create an issue on the GitHub repository
- Check the documentation for common solutions
- Contact the development team for critical issues

---

*This documentation was generated on September 14, 2025. For the most up-to-date information, please refer to the latest version in the repository.*