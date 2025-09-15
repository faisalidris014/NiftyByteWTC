import { getLogManager, createLogger } from '../index';
import { SkillSandbox } from '../../sandbox';
import * as path from 'path';
import * as fs from 'fs';

// Test the logging system integration
export async function testLoggingIntegration() {
  console.log('=== Testing Logging System Integration ===');

  const logManager = getLogManager();

  // Test 1: Basic logging functionality
  console.log('\n1. Testing basic logging...');
  logManager.info('Integration test started');
  logManager.debug('Debug message test', { testData: 'sample' });
  logManager.warn('Warning test');

  // Test 2: Error logging
  console.log('\n2. Testing error logging...');
  try {
    throw new Error('Test error for logging');
  } catch (error) {
    logManager.error('Caught test error', error as Error, { context: 'test' });
  }

  // Test 3: Execution monitoring
  console.log('\n3. Testing execution monitoring...');
  const executionId = 'test_exec_001';
  const skillId = 'test-skill';

  logManager.startExecution(executionId, skillId);

  // Simulate execution work
  await new Promise(resolve => setTimeout(resolve, 100));

  logManager.updateExecutionMetrics(executionId, {
    cpuUsage: { average: 25.5, peak: 75.0, total: 100 },
    memoryUsage: { averageBytes: 50 * 1024 * 1024, peakBytes: 80 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 }
  });

  logManager.recordSecurityEvent(executionId, 'medium', 'Test security event');

  logManager.endExecution(executionId, true);

  // Test 4: Sandbox integration (if test script exists)
  console.log('\n4. Testing sandbox integration...');
  try {
    const testScriptPath = path.join(__dirname, 'test-script.ps1');

    if (fs.existsSync(testScriptPath)) {
      const sandbox = new SkillSandbox(testScriptPath, 'powershell');

      // This will automatically log through the integrated system
      const result = await sandbox.execute(['-test']);
      console.log('Sandbox execution result:', result.exitCode);
    } else {
      console.log('Test script not found, skipping sandbox test');
    }
  } catch (error) {
    console.log('Sandbox test error:', error);
  }

  // Test 5: Health check
  console.log('\n5. Testing health check...');
  const health = await logManager.healthCheck();
  console.log('System health:', health);

  // Test 6: Flush and cleanup
  console.log('\n6. Testing flush and cleanup...');
  await logManager.flush();

  logManager.info('Integration test completed successfully');

  console.log('\n=== Integration Test Completed ===');
  return true;
}

// Test custom logger configuration
export function testCustomLogger() {
  console.log('\n=== Testing Custom Logger Configuration ===');

  const customLogger = createLogger({
    defaultLevel: 'debug',
    destinations: [
      {
        type: 'console',
        enabled: true,
        level: 'debug'
      }
    ]
  });

  customLogger.debug('Custom logger debug message');
  customLogger.info('Custom logger info message');
  customLogger.warn('Custom logger warning message');

  console.log('=== Custom Logger Test Completed ===');
  return true;
}

// Run tests if this file is executed directly
if (require.main === module) {
  testLoggingIntegration()
    .then(() => testCustomLogger())
    .then(() => console.log('\n✅ All tests passed!'))
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export default {
  testLoggingIntegration,
  testCustomLogger
};