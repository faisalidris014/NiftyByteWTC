import { ITSMIntegrationManager, CredentialManager, ConnectionTester, ServiceNowConnector, JiraConnector } from '..';
import { ITSMConnectionConfig, StandardizedTicketPayload } from '../types';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ITSM Integration System', () => {
  let integrationManager: ITSMIntegrationManager;
  let credentialManager: CredentialManager;

  const mockServiceNowConfig: ITSMConnectionConfig = {
    id: 'test-servicenow',
    name: 'Test ServiceNow',
    type: 'servicenow',
    baseUrl: 'https://test-instance.service-now.com',
    credentials: {
      type: 'basic',
      username: 'testuser',
      password: 'testpass'
    },
    enabled: true,
    defaultPriority: 'medium',
    defaultCategory: 'IT Support',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    syncIntervalMs: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const mockJiraConfig: ITSMConnectionConfig = {
    id: 'test-jira',
    name: 'Test Jira',
    type: 'jira',
    baseUrl: 'https://test-atlassian.net',
    credentials: {
      type: 'api_token',
      username: 'test@example.com',
      apiToken: 'test-token'
    },
    enabled: true,
    defaultPriority: 'medium',
    defaultCategory: 'SUPPORT',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    syncIntervalMs: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const mockTicketData: StandardizedTicketPayload = {
    summary: 'Test network connectivity issue',
    description: 'User cannot connect to corporate WiFi network',
    category: 'Network',
    priority: 'high',
    user: {
      id: 'user123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      department: 'Engineering'
    },
    systemInfo: {
      osVersion: 'Windows 10 22H2',
      architecture: 'x64',
      deviceName: 'JOHN-LAPTOP',
      deviceId: 'device-123456',
      macAddress: '00:1A:2B:3C:4D:5E'
    },
    skillResults: [
      {
        skillId: 'wifi-reset',
        skillName: 'WiFi Adapter Reset',
        status: 'success',
        output: 'WiFi adapter reset successfully',
        executionTimeMs: 1500,
        startedAt: Date.now() - 5000,
        completedAt: Date.now() - 3500
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

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockReset();

    // Create new instances for each test
    credentialManager = new CredentialManager('test-master-key');
    integrationManager = new ITSMIntegrationManager('test-master-key');
  });

  describe('CredentialManager', () => {
    test('should store and retrieve connections', () => {
      const connectionId = credentialManager.storeConnection(mockServiceNowConfig);
      expect(connectionId).toBeDefined();

      const retrieved = credentialManager.retrieveConnection(connectionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe(mockServiceNowConfig.name);
      expect(retrieved?.credentials.username).toBe(mockServiceNowConfig.credentials.username);
    });

    test('should validate connection configurations', () => {
      const errors = credentialManager.validateConnection({
        ...mockServiceNowConfig,
        baseUrl: ''
      });

      expect(errors).toContain('Base URL is required');
    });

    test('should list connections', () => {
      credentialManager.storeConnection(mockServiceNowConfig);
      credentialManager.storeConnection(mockJiraConfig);

      const connections = credentialManager.listConnections();
      expect(connections.length).toBe(2);
      expect(connections[0].name).toBe(mockServiceNowConfig.name);
    });
  });

  describe('ConnectionTester', () => {
    test('should validate connection configurations', () => {
      const errors = ConnectionTester.validateConnectionConfig({
        ...mockServiceNowConfig,
        name: ''
      });

      expect(errors).toContain('Connection name is required');
    });

    test('should validate credentials', () => {
      const errors = ConnectionTester.validateCredentials({
        username: ''
      }, 'servicenow');

      expect(errors).toContain('ServiceNow requires username');
      expect(errors).toContain('ServiceNow requires password');
    });
  });

  describe('ServiceNowConnector', () => {
    test('should validate ticket data', () => {
      const connector = new ServiceNowConnector(mockServiceNowConfig);
      const errors = connector['validateTicketData']({
        ...mockTicketData,
        summary: ''
      } as any);

      expect(errors).toContain('Summary is required');
    });

    test('should map priority correctly', () => {
      const connector = new ServiceNowConnector(mockServiceNowConfig);

      const urgency = connector['mapPriorityToUrgency']('critical');
      expect(urgency).toBe('1');

      const impact = connector['mapPriorityToImpact']('low');
      expect(impact).toBe('4');
    });
  });

  describe('JiraConnector', () => {
    test('should build description correctly', () => {
      const connector = new JiraConnector(mockJiraConfig);
      const description = connector['buildDescription'](mockTicketData);

      expect(description).toContain('h3. Issue Description');
      expect(description).toContain('User cannot connect to corporate WiFi network');
      expect(description).toContain('John Doe');
      expect(description).toContain('Windows 10 22H2');
    });

    test('should generate labels correctly', () => {
      const connector = new JiraConnector(mockJiraConfig);
      const labels = connector['generateLabels'](mockTicketData);

      expect(labels).toContain('windows-troubleshooter');
      expect(labels).toContain('priority-high');
      expect(labels).toContain('category-network');
    });
  });

  describe('IntegrationManager', () => {
    test('should add and list connections', async () => {
      const connectionId = await integrationManager.addConnection(mockServiceNowConfig);
      expect(connectionId).toBeDefined();

      const connections = integrationManager.listConnections();
      expect(connections.length).toBe(1);
      expect(connections[0].name).toBe(mockServiceNowConfig.name);
    });

    test('should get health status', async () => {
      await integrationManager.addConnection(mockServiceNowConfig);
      const healthStatus = integrationManager.getHealthStatus();

      expect(healthStatus.size).toBe(1);
      // Connection should be unhealthy since we didn't actually initialize it
      expect(Array.from(healthStatus.values())[0].status).toBe('unhealthy');
    });

    test('should get statistics', async () => {
      await integrationManager.addConnection(mockServiceNowConfig);
      const stats = integrationManager.getStatistics();

      expect(stats.totalConnections).toBe(1);
      expect(stats.enabledConnections).toBe(1);
      expect(stats.healthyConnections).toBe(0); // Not initialized
    });
  });

  describe('Error Handling', () => {
    test('should handle retryable errors', () => {
      const connector = new ServiceNowConnector(mockServiceNowConfig);

      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNRESET';

      const isRetryable = connector['isErrorRetryable'](networkError);
      expect(isRetryable).toBe(true);
    });

    test('should handle non-retryable errors', () => {
      const connector = new ServiceNowConnector(mockServiceNowConfig);

      const authError = new Error('Authentication failed');
      (authError as any).code = 'AUTH_FAILED';

      const isRetryable = connector['isErrorRetryable'](authError);
      expect(isRetryable).toBe(false);
    });

    test('should calculate backoff delay with jitter', () => {
      const connector = new ServiceNowConnector(mockServiceNowConfig);

      const delay = connector['calculateBackoffDelay'](2, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffFactor: 2,
        jitter: true,
        retryableErrorCodes: []
      });

      // Delay should be between 1600 and 2400 ms (2000 ± 20%)
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});