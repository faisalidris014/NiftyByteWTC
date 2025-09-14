import { ServiceNowConnector } from './servicenow-connector';
import { JiraConnector } from './jira-connector';
import { CredentialManager } from './credential-manager';
import {
  ITSMConnectionConfig,
  StandardizedTicketPayload,
  TicketCreationResult,
  ConnectionTestResult,
  ITSMHealthStatus,
  ITSM_ERROR_CODES
} from './types';

interface ConnectionStatus {
  connector: ServiceNowConnector | JiraConnector;
  config: ITSMConnectionConfig;
  lastHealthCheck: number;
  healthStatus: ITSMHealthStatus;
  errorCount: number;
  successCount: number;
}

export class ITSMIntegrationManager {
  private connections: Map<string, ConnectionStatus> = new Map();
  private credentialManager: CredentialManager;
  private isInitialized: boolean = false;

  constructor(masterKey: string) {
    this.credentialManager = new CredentialManager(masterKey);
  }

  /**
   * Initialize the integration manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load and initialize all enabled connections
    const connections = this.credentialManager.listConnections();

    for (const connectionInfo of connections) {
      if (connectionInfo.enabled) {
        await this.initializeConnection(connectionInfo.id);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Initialize a specific connection
   */
  async initializeConnection(connectionId: string): Promise<boolean> {
    let config: ITSMConnectionConfig | null = null;
    try {
      config = this.credentialManager.retrieveConnection(connectionId);
      if (!config) {
        console.error(`Connection ${connectionId} not found`);
        return false;
      }

      if (!config.enabled) {
        console.log(`Connection ${connectionId} is disabled, skipping initialization`);
        return false;
      }

      let connector: ServiceNowConnector | JiraConnector;

      switch (config.type) {
        case 'servicenow':
          connector = new ServiceNowConnector(config);
          break;
        case 'jira':
          connector = new JiraConnector(config);
          break;
        default:
          throw new Error(`Unsupported ITSM type: ${config.type}`);
      }

      await connector.initialize();

      this.connections.set(connectionId, {
        connector,
        config,
        lastHealthCheck: Date.now(),
        healthStatus: {
          connectionId,
          status: 'healthy',
          lastTested: Date.now(),
          message: 'Connection initialized successfully'
        },
        errorCount: 0,
        successCount: 0
      });

      console.log(`Initialized ${config.type} connection: ${config.name}`);
      return true;

    } catch (error) {
      console.error(`Failed to initialize connection ${connectionId}:`, error);

      // Mark as unhealthy - use a default config if config is undefined
      const fallbackConfig: ITSMConnectionConfig = {
        id: connectionId,
        name: 'Unknown',
        type: 'servicenow',
        baseUrl: '',
        credentials: { type: 'basic' },
        enabled: false,
        defaultPriority: 'medium',
        timeoutMs: 30000,
        maxRetries: 3,
        retryDelayMs: 1000,
        syncIntervalMs: 30000,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      this.connections.set(connectionId, {
        connector: null as any,
        config: config || fallbackConfig,
        lastHealthCheck: Date.now(),
        healthStatus: {
          connectionId,
          status: 'unhealthy',
          lastTested: Date.now(),
          message: `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
          errorRate: 100
        },
        errorCount: 1,
        successCount: 0
      });

      return false;
    }
  }

  /**
   * Create ticket across all enabled connections
   */
  async createTicket(ticketData: StandardizedTicketPayload): Promise<Map<string, TicketCreationResult>> {
    const results = new Map<string, TicketCreationResult>();

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      if (!connection.config.enabled) {
        continue;
      }

      try {
        const result = await connection.connector.createTicket(ticketData);
        results.set(connectionId, result);

        // Update health metrics
        if (result.success) {
          connection.successCount++;
          connection.healthStatus.status = 'healthy';
        } else {
          connection.errorCount++;
          connection.healthStatus.status = 'degraded';
        }

        connection.lastHealthCheck = Date.now();
        connection.healthStatus.lastTested = Date.now();
        connection.healthStatus.errorRate = this.calculateErrorRate(connection);

      } catch (error) {
        const errorResult: TicketCreationResult = {
          success: false,
          error: {
            code: ITSM_ERROR_CODES.TICKET_CREATION_FAILED,
            message: error instanceof Error ? error.message : 'Failed to create ticket',
            retryable: true
          },
          timestamp: Date.now(),
          durationMs: 0
        };

        results.set(connectionId, errorResult);

        // Update health metrics
        connection.errorCount++;
        connection.healthStatus.status = 'unhealthy';
        connection.healthStatus.lastTested = Date.now();
        connection.healthStatus.errorRate = this.calculateErrorRate(connection);
        connection.healthStatus.message = `Ticket creation failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return results;
  }

  /**
   * Test all connections
   */
  async testAllConnections(): Promise<Map<string, ConnectionTestResult>> {
    const results = new Map<string, ConnectionTestResult>();

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      if (!connection.config.enabled) {
        continue;
      }

      try {
        const result = await connection.connector.testConnection();
        results.set(connectionId, result);

        // Update health metrics
        if (result.success) {
          connection.successCount++;
          connection.healthStatus.status = 'healthy';
          connection.healthStatus.responseTimeMs = result.responseTimeMs;
        } else {
          connection.errorCount++;
          connection.healthStatus.status = result.error?.code === 'RATE_LIMITED' ? 'degraded' : 'unhealthy';
        }

        connection.lastHealthCheck = Date.now();
        connection.healthStatus.lastTested = Date.now();
        connection.healthStatus.errorRate = this.calculateErrorRate(connection);
        connection.healthStatus.message = result.message;

      } catch (error) {
        const errorResult: ConnectionTestResult = {
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
          error: {
            code: ITSM_ERROR_CODES.CONNECTION_FAILED,
            message: error instanceof Error ? error.message : 'Test failed'
          },
          timestamp: Date.now()
        };

        results.set(connectionId, errorResult);

        // Update health metrics
        connection.errorCount++;
        connection.healthStatus.status = 'unhealthy';
        connection.healthStatus.lastTested = Date.now();
        connection.healthStatus.errorRate = this.calculateErrorRate(connection);
        connection.healthStatus.message = `Test failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return results;
  }

  /**
   * Get health status of all connections
   */
  getHealthStatus(): Map<string, ITSMHealthStatus> {
    const statusMap = new Map<string, ITSMHealthStatus>();

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      statusMap.set(connectionId, { ...connection.healthStatus });
    }

    return statusMap;
  }

  /**
   * Add a new connection
   */
  async addConnection(config: ITSMConnectionConfig): Promise<string> {
    const validationErrors = this.credentialManager.validateConnection(config);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid connection configuration: ${validationErrors.join(', ')}`);
    }

    const connectionId = this.credentialManager.storeConnection(config);

    if (config.enabled) {
      await this.initializeConnection(connectionId);
    }

    return connectionId;
  }

  /**
   * Update an existing connection
   */
  async updateConnection(connectionId: string, updates: Partial<ITSMConnectionConfig>): Promise<boolean> {
    const success = this.credentialManager.updateConnection(connectionId, updates);
    if (!success) {
      return false;
    }

    // Re-initialize if the connection was updated and is enabled
    if (updates.enabled !== false) {
      await this.initializeConnection(connectionId);
    } else {
      // Remove from active connections if disabled
      this.connections.delete(connectionId);
    }

    return true;
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): boolean {
    this.connections.delete(connectionId);
    return this.credentialManager.deleteConnection(connectionId);
  }

  /**
   * Get all connections
   */
  listConnections() {
    return this.credentialManager.listConnections();
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const [_, connection] of Array.from(this.connections.entries())) {
      try {
        await connection.connector.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }

    this.connections.clear();
    this.isInitialized = false;
  }

  /**
   * Export connections for backup
   */
  exportConnections(): string {
    return this.credentialManager.exportConnections();
  }

  /**
   * Import connections from backup
   */
  importConnections(exportData: string): number {
    return this.credentialManager.importConnections(exportData);
  }

  /**
   * Clean up old connections
   */
  cleanupOldConnections(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
    return this.credentialManager.cleanupOldConnections(maxAgeMs);
  }

  /**
   * Rotate encryption key
   */
  rotateKey(newMasterKey: string): void {
    this.credentialManager.rotateKey(newMasterKey);
  }

  /**
   * Get connection statistics
   */
  getStatistics() {
    let totalConnections = 0;
    let enabledConnections = 0;
    let healthyConnections = 0;
    let totalErrors = 0;
    let totalSuccess = 0;

    for (const connection of Array.from(this.connections.values())) {
      totalConnections++;
      if (connection.config.enabled) {
        enabledConnections++;
      }
      if (connection.healthStatus.status === 'healthy') {
        healthyConnections++;
      }
      totalErrors += connection.errorCount;
      totalSuccess += connection.successCount;
    }

    return {
      totalConnections,
      enabledConnections,
      healthyConnections,
      totalErrors,
      totalSuccess,
      overallHealth: healthyConnections === enabledConnections ? 'healthy' :
                   healthyConnections > 0 ? 'degraded' : 'unhealthy'
    };
  }

  private calculateErrorRate(connection: ConnectionStatus): number {
    const totalOperations = connection.errorCount + connection.successCount;
    if (totalOperations === 0) {
      return 0;
    }
    return (connection.errorCount / totalOperations) * 100;
  }
}