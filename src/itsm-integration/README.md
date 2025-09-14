# ITSM Integration System

A comprehensive integration system for connecting with various IT Service Management (ITSM) platforms like ServiceNow and Jira Service Desk. Provides secure credential management, standardized ticket formatting, and robust error handling.

## Features

- **Multi-Platform Support**: ServiceNow, Jira Service Desk, Zendesk, Salesforce (extensible)
- **Secure Credential Management**: AES-256 encryption with key rotation
- **Standardized Ticket Format**: Consistent payload structure across all ITSM systems
- **Robust Error Handling**: Exponential backoff retry logic with jitter
- **Connection Testing**: Comprehensive validation and health checks
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install
# or
yarn install
```

## Usage

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

## Architecture

### Components

1. **BaseConnector**: Abstract base class with common functionality
2. **ServiceNowConnector**: ServiceNow REST API implementation
3. **JiraConnector**: Jira Service Desk API implementation
4. **CredentialManager**: Secure credential storage and management
5. **IntegrationManager**: Main orchestrator for all ITSM operations
6. **ConnectionTester**: Comprehensive connection validation utilities

### Data Flow

1. **Ticket Creation**: Standardized payload → ITSM-specific mapping → API call → Result processing
2. **Credential Management**: Encryption → Secure storage → Decryption → Authentication
3. **Error Handling**: Error detection → Retry logic → Fallback handling → Logging

## Security Features

- **AES-256 Encryption**: Credentials encrypted at rest
- **Key Rotation**: Regular encryption key updates
- **Secure Storage**: Memory-only credential handling
- **Input Validation**: Comprehensive data validation
- **TLS Enforcement**: SSL certificate validation

## Error Handling

The system includes comprehensive error handling with:

- **Retry Logic**: Exponential backoff with jitter
- **Error Classification**: Retryable vs non-retryable errors
- **Circuit Breaker**: Automatic failure detection
- **Health Monitoring**: Connection status tracking
- **Detailed Logging**: Structured error information

## Configuration

### Environment Variables

```bash
OFFLINE_QUEUE_ENCRYPTION_KEY=your-encryption-key
OFFLINE_QUEUE_DB_PATH=./data/offline-queue.db
NODE_ENV=production
```

### Connection Configuration

Each connection supports:
- Basic authentication (username/password)
- API token authentication
- OAuth2 support (future)
- Custom timeouts and retry settings
- Priority and category mappings

## Testing

Run the test suite:

```bash
npm test
# or
yarn test
```

## API Reference

### ITSMIntegrationManager

- `initialize()`: Initialize all connections
- `createTicket(ticketData)`: Create ticket across all enabled connections
- `testAllConnections()`: Test all connections
- `addConnection(config)`: Add new connection
- `updateConnection(id, updates)`: Update existing connection
- `removeConnection(id)`: Remove connection
- `getHealthStatus()`: Get health status of all connections
- `listConnections()`: List all stored connections

### ConnectionTester

- `testConnection(config)`: Test a connection configuration
- `validateConnectionConfig(config)`: Validate configuration
- `comprehensiveTest(config)`: Run comprehensive connection test
- `generateTestReport(results)`: Generate test report

## Supported ITSM Systems

### ServiceNow
- Incident table API
- Basic authentication
- Custom field mapping
- Priority/urgency/impact mapping

### Jira Service Desk
- Issue creation API
- API token authentication
- Custom field support
- Label and component management

### Future Support
- Zendesk
- Salesforce Service Cloud
- Freshservice
- BMC Helix

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review existing test cases