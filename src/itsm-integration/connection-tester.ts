import { ITSMConnectionConfig, ConnectionTestResult, ITSM_ERROR_CODES } from './types';
import { ServiceNowConnector } from './servicenow-connector';
import { JiraConnector } from './jira-connector';

export class ConnectionTester {
  /**
   * Test a connection configuration without storing it
   */
  static async testConnection(config: ITSMConnectionConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // Validate configuration first
      const validationErrors = this.validateConnectionConfig(config);
      if (validationErrors.length > 0) {
        return {
          success: false,
          message: `Configuration validation failed: ${validationErrors.join(', ')}`,
          error: {
            code: ITSM_ERROR_CODES.INVALID_CONFIG,
            message: 'Invalid connection configuration'
          },
          timestamp: Date.now()
        };
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
          return {
            success: false,
            message: `Unsupported ITSM type: ${config.type}`,
            error: {
              code: ITSM_ERROR_CODES.INVALID_CONFIG,
              message: 'Unsupported ITSM system type'
            },
            timestamp: Date.now()
          };
      }

      // Test the connection
      const result = await connector.testConnection();
      const durationMs = Date.now() - startTime;

      return {
        ...result,
        responseTimeMs: durationMs
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
        responseTimeMs: durationMs,
        error: {
          code: ITSM_ERROR_CODES.CONNECTION_FAILED,
          message: error instanceof Error ? error.message : 'Test failed'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Validate connection configuration
   */
  static validateConnectionConfig(config: ITSMConnectionConfig): string[] {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Connection name is required');
    }

    if (!config.baseUrl) {
      errors.push('Base URL is required');
    }

    try {
      new URL(config.baseUrl);
    } catch {
      errors.push('Base URL must be a valid URL');
    }

    if (!config.credentials) {
      errors.push('Credentials are required');
    } else {
      errors.push(...this.validateCredentials(config.credentials, config.type));
    }

    if (config.timeoutMs && config.timeoutMs < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    if (config.maxRetries && config.maxRetries < 0) {
      errors.push('Max retries cannot be negative');
    }

    if (config.retryDelayMs && config.retryDelayMs < 0) {
      errors.push('Retry delay cannot be negative');
    }

    return errors;
  }

  /**
   * Validate credentials based on ITSM type
   */
  static validateCredentials(credentials: any, type: string): string[] {
    const errors: string[] = [];

    if (!credentials || typeof credentials !== 'object') {
      return ['Credentials must be an object'];
    }

    switch (type) {
      case 'servicenow':
        if (!credentials.username) {
          errors.push('ServiceNow requires username');
        }
        if (!credentials.password) {
          errors.push('ServiceNow requires password');
        }
        break;

      case 'jira':
        if (!credentials.username) {
          errors.push('Jira requires email address');
        }
        if (!credentials.apiToken) {
          errors.push('Jira requires API token');
        }
        break;

      case 'zendesk':
        if (!credentials.username) {
          errors.push('Zendesk requires email address');
        }
        if (!credentials.apiToken) {
          errors.push('Zendesk requires API token');
        }
        break;

      case 'salesforce':
        if (!credentials.username) {
          errors.push('Salesforce requires username');
        }
        if (!credentials.password) {
          errors.push('Salesforce requires password');
        }
        if (!credentials.clientId) {
          errors.push('Salesforce requires client ID');
        }
        if (!credentials.clientSecret) {
          errors.push('Salesforce requires client secret');
        }
        break;

      default:
        errors.push(`Unsupported ITSM type: ${type}`);
    }

    return errors;
  }

  /**
   * Perform comprehensive connection test with multiple checks
   */
  static async comprehensiveTest(config: ITSMConnectionConfig): Promise<{
    basicTest: ConnectionTestResult;
    authenticationTest: ConnectionTestResult;
    apiAccessTest: ConnectionTestResult;
    overallStatus: 'pass' | 'fail' | 'partial';
    details: string[];
  }> {
    const results = {
      basicTest: {} as ConnectionTestResult,
      authenticationTest: {} as ConnectionTestResult,
      apiAccessTest: {} as ConnectionTestResult,
      overallStatus: 'pass' as 'pass' | 'fail' | 'partial',
      details: [] as string[]
    };

    // Test 1: Basic connectivity
    results.basicTest = await this.testBasicConnectivity(config.baseUrl);
    if (!results.basicTest.success) {
      results.overallStatus = 'fail';
      results.details.push(`Basic connectivity failed: ${results.basicTest.message}`);
      return results;
    }
    results.details.push('Basic connectivity: OK');

    // Test 2: Authentication
    results.authenticationTest = await this.testConnection(config);
    if (!results.authenticationTest.success) {
      results.overallStatus = 'fail';
      results.details.push(`Authentication failed: ${results.authenticationTest.message}`);
      return results;
    }
    results.details.push('Authentication: OK');

    // Test 3: API access (type-specific)
    results.apiAccessTest = await this.testApiAccess(config);
    if (!results.apiAccessTest.success) {
      results.overallStatus = 'partial';
      results.details.push(`API access failed: ${results.apiAccessTest.message}`);
    } else {
      results.details.push('API access: OK');
    }

    return results;
  }

  /**
   * Test basic network connectivity
   */
  private static async testBasicConnectivity(url: string): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      const parsedUrl = new URL(url);
      const testUrl = `${parsedUrl.origin}/`;

      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: 'Basic connectivity test passed',
          responseTimeMs: durationMs,
          timestamp: Date.now()
        };
      } else {
        return {
          success: false,
          message: `Server responded with status ${response.status}`,
          responseTimeMs: durationMs,
          error: {
            code: 'HTTP_' + response.status,
            message: response.statusText
          },
          timestamp: Date.now()
        };
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Basic connectivity test failed',
        responseTimeMs: durationMs,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Test API-specific access
   */
  private static async testApiAccess(config: ITSMConnectionConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      switch (config.type) {
        case 'servicenow':
          return await this.testServiceNowApiAccess(config);
        case 'jira':
          return await this.testJiraApiAccess(config);
        default:
          return {
            success: false,
            message: `API access test not implemented for ${config.type}`,
            timestamp: Date.now()
          };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'API access test failed',
        responseTimeMs: durationMs,
        error: {
          code: 'API_TEST_FAILED',
          message: error instanceof Error ? error.message : 'API test error'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Test ServiceNow API access
   */
  private static async testServiceNowApiAccess(config: ITSMConnectionConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const authHeader = 'Basic ' + Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64');

    try {
      const response = await fetch(`${config.baseUrl}/api/now/table/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: 'ServiceNow API access test passed',
          responseTimeMs: durationMs,
          timestamp: Date.now()
        };
      } else if (response.status === 403 || response.status === 401) {
        return {
          success: false,
          message: 'ServiceNow API access denied - check user permissions',
          responseTimeMs: durationMs,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Insufficient permissions for API access'
          },
          timestamp: Date.now()
        };
      } else {
        return {
          success: false,
          message: `ServiceNow API returned status ${response.status}`,
          responseTimeMs: durationMs,
          error: {
            code: 'HTTP_' + response.status,
            message: response.statusText
          },
          timestamp: Date.now()
        };
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'ServiceNow API access test failed',
        responseTimeMs: durationMs,
        error: {
          code: 'API_TEST_FAILED',
          message: error instanceof Error ? error.message : 'API test error'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Test Jira API access
   */
  private static async testJiraApiAccess(config: ITSMConnectionConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const authHeader = 'Basic ' + Buffer.from(`${config.credentials.username}:${config.credentials.apiToken}`).toString('base64');

    try {
      const response = await fetch(`${config.baseUrl}/rest/api/2/myself`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: 'Jira API access test passed',
          responseTimeMs: durationMs,
          timestamp: Date.now()
        };
      } else if (response.status === 403 || response.status === 401) {
        return {
          success: false,
          message: 'Jira API access denied - check user permissions',
          responseTimeMs: durationMs,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Insufficient permissions for API access'
          },
          timestamp: Date.now()
        };
      } else {
        return {
          success: false,
          message: `Jira API returned status ${response.status}`,
          responseTimeMs: durationMs,
          error: {
            code: 'HTTP_' + response.status,
            message: response.statusText
          },
          timestamp: Date.now()
        };
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Jira API access test failed',
        responseTimeMs: durationMs,
        error: {
          code: 'API_TEST_FAILED',
          message: error instanceof Error ? error.message : 'API test error'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate connection test report
   */
  static generateTestReport(results: ConnectionTestResult[]): string {
    let report = 'Connection Test Report\n';
    report += '='.repeat(50) + '\n\n';

    results.forEach((result, index) => {
      report += `Test ${index + 1}:\n`;
      report += `Status: ${result.success ? 'PASS' : 'FAIL'}\n`;
      report += `Message: ${result.message}\n`;
      if (result.responseTimeMs) {
        report += `Response Time: ${result.responseTimeMs}ms\n`;
      }
      if (result.error) {
        report += `Error: ${result.error.code} - ${result.error.message}\n`;
      }
      report += '\n';
    });

    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    report += `Summary: ${passed} passed, ${failed} failed\n`;

    return report;
  }
}