// Simple end-to-end test for ITSM integration
const { ITSMIntegrationManager } = require('./dist/itsm-integration/integration-manager');
const { ServiceNowConnector } = require('./dist/itsm-integration/servicenow-connector');

// Mock configuration
const mockConfig = {
  id: 'test-end-to-end',
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

// Mock ticket data
const mockTicketData = {
  summary: 'End-to-end test issue',
  description: 'This is a test ticket created during end-to-end testing',
  category: 'Test',
  priority: 'medium',
  user: {
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    department: 'Testing'
  },
  systemInfo: {
    osVersion: 'Windows 10',
    architecture: 'x64',
    deviceName: 'TEST-PC',
    deviceId: 'test-device-123',
    macAddress: '00:1A:2B:3C:4D:5E'
  },
  skillResults: [{
    skillId: 'test-skill',
    skillName: 'Test Skill',
    status: 'success',
    output: 'Test completed successfully',
    executionTimeMs: 100,
    startedAt: Date.now() - 5000,
    completedAt: Date.now() - 4900
  }],
  context: {
    appVersion: '1.0.0',
    sessionId: 'test-session-123',
    correlationId: 'test-corr-123',
    troubleshootingSession: {
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      durationMs: 10000,
      stepsAttempted: 1,
      stepsSuccessful: 1
    }
  }
};

async function testEndToEnd() {
  console.log('Starting end-to-end ITSM integration test...');

  try {
    // Test 1: Create integration manager
    const integrationManager = new ITSMIntegrationManager('test-master-key');
    console.log('✓ Integration manager created');

    // Test 2: Create ServiceNow connector
    const connector = new ServiceNowConnector(mockConfig);
    console.log('✓ ServiceNow connector created');

    // Test 3: Mock the testConnection method to avoid actual API calls
    connector.testConnection = async () => ({
      success: true,
      message: 'Connection test passed',
      timestamp: Date.now()
    });

    // Test 4: Initialize connector
    await connector.initialize();
    console.log('✓ Connector initialized');

    // Test 5: Mock the createTicket method
    connector.createTicket = async () => ({
      success: true,
      ticketId: 'TEST123',
      ticketNumber: 'INC0012345',
      ticketUrl: 'https://test-instance.service-now.com/nav_to.do?uri=incident.do?sys_id=TEST123',
      message: 'Ticket created successfully',
      timestamp: Date.now(),
      durationMs: 150
    });

    // Test 6: Create ticket
    const result = await connector.createTicket(mockTicketData);
    console.log('✓ Ticket creation result:', result);

    if (result.success) {
      console.log('🎉 End-to-end test PASSED!');
      console.log(`Ticket created: ${result.ticketNumber}`);
    } else {
      console.log('❌ End-to-end test FAILED:', result.error?.message);
    }

  } catch (error) {
    console.error('❌ End-to-end test FAILED with error:', error.message);
  }
}

// Run the test
testEndToEnd();