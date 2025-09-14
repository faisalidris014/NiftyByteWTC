// ITSM Integration System Usage Examples
// This file demonstrates how to use the ITSM integration system

import ITSMIntegrationManager, { ConnectionTester } from '..';
import { ITSMConnectionConfig, StandardizedTicketPayload } from '../types';

// Example 1: Basic Setup and Initialization
async function exampleBasicSetup() {
  console.log('=== Example 1: Basic Setup ===');

  // Initialize the integration manager with a secure master key
  // In production, this should come from a secure source like environment variables
  const integrationManager = new ITSMIntegrationManager('your-secure-master-key-123');

  try {
    // Initialize all enabled connections
    await integrationManager.initialize();
    console.log('Integration manager initialized successfully');

    // Get health status
    const healthStatus = integrationManager.getHealthStatus();
    console.log('Health status:', Object.fromEntries(healthStatus));

    // Get statistics
    const stats = integrationManager.getStatistics();
    console.log('System statistics:', stats);

  } catch (error) {
    console.error('Failed to initialize integration manager:', error);
  }
}

// Example 2: Adding Connections
async function exampleAddConnections() {
  console.log('\n=== Example 2: Adding Connections ===');

  const integrationManager = new ITSMIntegrationManager('your-secure-master-key-123');

  // ServiceNow connection configuration
  const serviceNowConfig: ITSMConnectionConfig = {
    id: 'servicenow-prod',
    name: 'Production ServiceNow',
    type: 'servicenow',
    baseUrl: 'https://your-company.service-now.com',
    credentials: {
      type: 'basic',
      username: 'api_user',
      password: 'secure_password_123'
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

  // Jira connection configuration
  const jiraConfig: ITSMConnectionConfig = {
    id: 'jira-servicedesk',
    name: 'Jira Service Desk',
    type: 'jira',
    baseUrl: 'https://your-company.atlassian.net',
    credentials: {
      type: 'api_token',
      username: 'admin@company.com',
      apiToken: 'your-api-token-here'
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

  try {
    // Test connections before adding
    console.log('Testing ServiceNow connection...');
    const serviceNowTest = await ConnectionTester.testConnection(serviceNowConfig);
    console.log('ServiceNow test result:', serviceNowTest.success ? 'PASS' : 'FAIL');

    console.log('Testing Jira connection...');
    const jiraTest = await ConnectionTester.testConnection(jiraConfig);
    console.log('Jira test result:', jiraTest.success ? 'PASS' : 'FAIL');

    // Add connections
    const serviceNowId = await integrationManager.addConnection(serviceNowConfig);
    const jiraId = await integrationManager.addConnection(jiraConfig);

    console.log('Added connections:');
    console.log('- ServiceNow:', serviceNowId);
    console.log('- Jira:', jiraId);

    // List all connections
    const connections = integrationManager.listConnections();
    console.log('Stored connections:', connections);

  } catch (error) {
    console.error('Failed to add connections:', error);
  }
}

// Example 3: Creating Tickets
async function exampleCreateTickets() {
  console.log('\n=== Example 3: Creating Tickets ===');

  const integrationManager = new ITSMIntegrationManager('your-secure-master-key-123');
  await integrationManager.initialize();

  // Standardized ticket data
  const ticketData: StandardizedTicketPayload = {
    summary: 'WiFi connectivity issues on Windows 11',
    description: `User reports intermittent WiFi connectivity issues on their Windows 11 laptop.
The connection drops frequently, especially when moving between conference rooms.

Troubleshooting steps attempted:
- Network adapter reset
- Driver update check
- WiFi profile recreation`,
    category: 'Network',
    priority: 'high',
    user: {
      id: 'emp12345',
      name: 'Sarah Johnson',
      email: 'sarah.johnson@company.com',
      department: 'Marketing',
      location: 'New York Office'
    },
    systemInfo: {
      osVersion: 'Windows 11 23H2',
      architecture: 'x64',
      deviceName: 'SARAH-WIN11',
      deviceId: 'laptop-789012',
      macAddress: 'A0:B1:C2:D3:E4:F5',
      ipAddress: '192.168.1.105'
    },
    skillResults: [
      {
        skillId: 'wifi-adapter-reset',
        skillName: 'WiFi Adapter Reset',
        status: 'success',
        output: 'WiFi adapter reset successfully. Connection restored temporarily.',
        executionTimeMs: 1200,
        startedAt: Date.now() - 15000,
        completedAt: Date.now() - 13800
      },
      {
        skillId: 'driver-check',
        skillName: 'Driver Version Check',
        status: 'success',
        output: 'Driver is up to date. Current version: 22.180.0.4',
        executionTimeMs: 800,
        startedAt: Date.now() - 13000,
        completedAt: Date.now() - 12200
      }
    ],
    context: {
      appVersion: '1.2.0',
      sessionId: 'session-abc123',
      correlationId: 'corr-def456',
      troubleshootingSession: {
        startTime: Date.now() - 18000,
        endTime: Date.now(),
        durationMs: 18000,
        stepsAttempted: 4,
        stepsSuccessful: 3
      },
      networkInfo: {
        connectionType: 'WiFi 6',
        signalStrength: 75,
        bandwidth: 120
      }
    }
  };

  try {
    console.log('Creating ticket across all enabled connections...');
    const results = await integrationManager.createTicket(ticketData);

    console.log('Ticket creation results:');
    for (const [connectionId, result] of results) {
      if (result.success) {
        console.log(`✅ ${connectionId}: Ticket #${result.ticketNumber} created`);
        console.log(`   URL: ${result.ticketUrl}`);
        console.log(`   Time: ${result.durationMs}ms`);
      } else {
        console.log(`❌ ${connectionId}: Failed - ${result.error?.message}`);
        if (result.error?.retryable) {
          console.log('   ⚠️  This error is retryable');
        }
      }
    }

  } catch (error) {
    console.error('Failed to create tickets:', error);
  }
}

// Example 4: Connection Management
async function exampleConnectionManagement() {
  console.log('\n=== Example 4: Connection Management ===');

  const integrationManager = new ITSMIntegrationManager('your-secure-master-key-123');

  // Add a test connection
  const testConfig: ITSMConnectionConfig = {
    id: 'test-connection',
    name: 'Test ServiceNow',
    type: 'servicenow',
    baseUrl: 'https://test.service-now.com',
    credentials: {
      type: 'basic',
      username: 'test',
      password: 'test'
    },
    enabled: true,
    defaultPriority: 'medium',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    syncIntervalMs: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const connectionId = await integrationManager.addConnection(testConfig);

  // Test the connection
  console.log('Testing connection...');
  const testResults = await integrationManager.testAllConnections();
  console.log('Test results:', Object.fromEntries(testResults));

  // Get health status
  const healthStatus = integrationManager.getHealthStatus();
  console.log('Health status:', Object.fromEntries(healthStatus));

  // Update connection (disable it)
  console.log('Disabling connection...');
  await integrationManager.updateConnection(connectionId, { enabled: false });

  // List connections to verify update
  const connections = integrationManager.listConnections();
  console.log('Updated connections:', connections);

  // Remove connection
  console.log('Removing connection...');
  integrationManager.removeConnection(connectionId);

  console.log('Final connections:', integrationManager.listConnections());
}

// Example 5: Error Handling and Retry Logic
async function exampleErrorHandling() {
  console.log('\n=== Example 5: Error Handling ===');

  // Demonstrate error handling with a failing connection
  const failingConfig: ITSMConnectionConfig = {
    id: 'failing-connection',
    name: 'Failing ServiceNow',
    type: 'servicenow',
    baseUrl: 'https://invalid-url-that-will-fail.com',
    credentials: {
      type: 'basic',
      username: 'invalid',
      password: 'invalid'
    },
    enabled: true,
    defaultPriority: 'medium',
    timeoutMs: 5000, // Short timeout for demo
    maxRetries: 2,
    retryDelayMs: 1000,
    syncIntervalMs: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    const integrationManager = new ITSMIntegrationManager('your-secure-master-key-123');
    await integrationManager.addConnection(failingConfig);

    // This will fail and demonstrate error handling
    const testResults = await integrationManager.testAllConnections();
    console.log('Error handling demonstration:', Object.fromEntries(testResults));

  } catch (error) {
    console.log('Error handled gracefully:', error.message);
  }
}

// Run all examples
async function runAllExamples() {
  console.log('ITSM Integration System Examples\n' + '='.repeat(50));

  await exampleBasicSetup();
  await exampleAddConnections();
  await exampleCreateTickets();
  await exampleConnectionManagement();
  await exampleErrorHandling();

  console.log('\n=== All examples completed ===');
}

// Export for use in other files
export {
  exampleBasicSetup,
  exampleAddConnections,
  exampleCreateTickets,
  exampleConnectionManagement,
  exampleErrorHandling,
  runAllExamples
};

// Run if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}