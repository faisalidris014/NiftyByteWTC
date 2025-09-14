import { BaseITSMCConnector } from './base-connector';
import {
  ITSMConnectionConfig,
  StandardizedTicketPayload,
  TicketCreationResult,
  ConnectionTestResult,
  JiraTicket,
  ITSM_ERROR_CODES
} from './types';

interface JiraIssue {
  fields: {
    project: {
      key: string;
    };
    issuetype: {
      name: string;
    };
    summary: string;
    description: string;
    priority?: {
      name: string;
    };
    components?: Array<{ name: string }>;
    labels?: string[];
    assignee?: {
      name: string;
    };
    reporter?: {
      name: string;
    };
    customfield_10000?: string; // Example custom field
    [key: string]: any;
  };
}

interface JiraResponse {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    priority: {
      name: string;
    };
    created: string;
    updated: string;
  };
}

interface JiraProject {
  key: string;
  name: string;
}

interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export class JiraConnector extends BaseITSMCConnector {
  private apiUrl: string;
  private authHeader: string;
  private projectKey: string;
  private issueType: string;

  constructor(config: ITSMConnectionConfig) {
    super(config);
    this.apiUrl = `${config.baseUrl}/rest/api/2/issue`;

    // Jira typically uses basic auth with email + API token
    this.authHeader = this.createBasicAuthHeader(
      config.credentials.username!, // Email
      config.credentials.apiToken!   // API Token
    );

    // Extract project and issue type from config
    this.projectKey = config.defaultCategory || 'SUPPORT';
    this.issueType = 'Service Request'; // Default issue type for Service Desk
  }

  async initialize(): Promise<void> {
    const configErrors = this.validateConfig();
    if (configErrors.length > 0) {
      throw new Error(`Invalid configuration: ${configErrors.join(', ')}`);
    }

    // Validate that we have API token credentials
    if (!this.config.credentials.username || !this.config.credentials.apiToken) {
      throw new Error('Jira requires email and API token for authentication');
    }

    // Test connection and validate project/issue type
    const testResult = await this.testConnection();
    if (!testResult.success) {
      throw new Error(`Jira connection test failed: ${testResult.message}`);
    }

    // Validate project exists
    const projectValid = await this.validateProject(this.projectKey);
    if (!projectValid) {
      throw new Error(`Jira project '${this.projectKey}' not found or inaccessible`);
    }

    this.isConnected = true;
    this.lastConnectionTime = Date.now();
  }

  async createTicket(ticketData: StandardizedTicketPayload): Promise<TicketCreationResult> {
    const startTime = Date.now();

    try {
      // Validate ticket data
      const validationErrors = this.validateTicketData(ticketData);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: {
            code: ITSM_ERROR_CODES.INVALID_TICKET_DATA,
            message: `Invalid ticket data: ${validationErrors.join(', ')}`,
            retryable: false
          },
          timestamp: Date.now(),
          durationMs: Date.now() - startTime
        };
      }

      // Convert to Jira format
      const jiraIssue = this.mapToJiraFormat(ticketData);

      // Create ticket with retry mechanism
      const result = await this.withRetry(
        () => this.createJiraIssue(jiraIssue),
        'createJiraIssue'
      );

      return {
        success: true,
        ticketId: result.id,
        ticketNumber: result.key,
        ticketUrl: `${this.config.baseUrl}/browse/${result.key}`,
        message: 'Jira issue created successfully',
        timestamp: Date.now(),
        durationMs: Date.now() - startTime
      };

    } catch (error) {
      return this.handleCreateTicketError(error, startTime);
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // Test by fetching server info
      const response = await fetch(`${this.config.baseUrl}/rest/api/2/serverInfo`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(this.options.timeoutMs!)
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          message: `Jira API returned status ${response.status}: ${response.statusText}`,
          responseTimeMs: responseTime,
          error: {
            code: 'HTTP_' + response.status,
            message: response.statusText
          },
          timestamp: Date.now()
        };
      }

      const serverInfo = await response.json();
      return {
        success: true,
        message: `Jira connection successful (Version: ${serverInfo.version})`,
        responseTimeMs: responseTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return this.handleConnectionTestError(error, startTime);
    }
  }

  async close(): Promise<void> {
    this.isConnected = false;
    // Jira doesn't require explicit connection closing
  }

  private async createJiraIssue(issue: JiraIssue): Promise<JiraResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(issue),
      signal: AbortSignal.timeout(this.options.timeoutMs!)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    return await response.json();
  }

  private async validateProject(projectKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/rest/api/2/project/${projectKey}`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private mapToJiraFormat(ticketData: StandardizedTicketPayload): JiraIssue {
    return {
      fields: {
        project: {
          key: this.projectKey
        },
        issuetype: {
          name: this.issueType
        },
        summary: ticketData.summary,
        description: this.buildDescription(ticketData),
        priority: {
          name: this.mapPriorityToJiraPriority(ticketData.priority)
        },
        labels: this.generateLabels(ticketData),
        components: this.generateComponents(ticketData),
        customfield_10000: this.buildCustomFields(ticketData)
      }
    };
  }

  private buildDescription(ticketData: StandardizedTicketPayload): string {
    let description = `h3. Issue Description\n${ticketData.description}\n\n`;

    // User information section
    description += `h3. User Information\n`;
    description += `*Name:* ${ticketData.user.name}\n`;
    if (ticketData.user.email) {
      description += `*Email:* ${ticketData.user.email}\n`;
    }
    if (ticketData.user.department) {
      description += `*Department:* ${ticketData.user.department}\n`;
    }
    if (ticketData.user.location) {
      description += `*Location:* ${ticketData.user.location}\n`;
    }
    description += '\n';

    // System information section
    description += `h3. System Information\n`;
    description += `*Device:* ${ticketData.systemInfo.deviceName}\n`;
    description += `*OS:* ${ticketData.systemInfo.osVersion} (${ticketData.systemInfo.architecture})\n`;
    description += `*Device ID:* ${ticketData.systemInfo.deviceId}\n`;
    if (ticketData.systemInfo.macAddress) {
      description += `*MAC Address:* ${ticketData.systemInfo.macAddress}\n`;
    }
    if (ticketData.systemInfo.ipAddress) {
      description += `*IP Address:* ${ticketData.systemInfo.ipAddress}\n`;
    }
    description += '\n';

    // Troubleshooting results section
    if (ticketData.skillResults && ticketData.skillResults.length > 0) {
      description += `h3. Troubleshooting Results\n`;
      description += `||Step||Skill||Status||Execution Time||Output||\n`;

      ticketData.skillResults.forEach((result, index) => {
        const outputPreview = result.output
          ? result.output.substring(0, 100).replace(/\|/g, '\\|')
          : '';
        description += `|${index + 1}|${result.skillName}|${result.status}|${result.executionTimeMs}ms|${outputPreview}${result.output && result.output.length > 100 ? '...' : ''}|\n`;
      });
      description += '\n';
    }

    // Context information
    description += `h3. Context Information\n`;
    description += `*App Version:* ${ticketData.context.appVersion}\n`;
    description += `*Session ID:* ${ticketData.context.sessionId}\n`;
    description += `*Correlation ID:* ${ticketData.context.correlationId}\n`;
    description += `*Troubleshooting Duration:* ${ticketData.context.troubleshootingSession.durationMs}ms\n`;
    description += `*Steps Successful:* ${ticketData.context.troubleshootingSession.stepsSuccessful}/${ticketData.context.troubleshootingSession.stepsAttempted}\n`;

    return description;
  }

  private generateLabels(ticketData: StandardizedTicketPayload): string[] {
    const labels: string[] = [
      'windows-troubleshooter',
      `priority-${ticketData.priority}`,
      `category-${ticketData.category.toLowerCase().replace(/\s+/g, '-')}`,
      `os-${ticketData.systemInfo.osVersion.split(' ')[0].toLowerCase()}`
    ];

    // Add user department if available
    if (ticketData.user.department) {
      labels.push(`dept-${ticketData.user.department.toLowerCase().replace(/\s+/g, '-')}`);
    }

    // Add skill labels
    ticketData.skillResults.forEach(result => {
      labels.push(`skill-${result.skillId.toLowerCase().replace(/\s+/g, '-')}`);
    });

    return labels;
  }

  private generateComponents(ticketData: StandardizedTicketPayload): Array<{ name: string }> {
    const components: Array<{ name: string }> = [
      { name: 'Windows Troubleshooting' }
    ];

    // Add category as component
    if (ticketData.category) {
      components.push({ name: ticketData.category });
    }

    return components;
  }

  private buildCustomFields(ticketData: StandardizedTicketPayload): string {
    const customData = {
      deviceId: ticketData.systemInfo.deviceId,
      appVersion: ticketData.context.appVersion,
      sessionId: ticketData.context.sessionId,
      correlationId: ticketData.context.correlationId,
      troubleshootingDuration: ticketData.context.troubleshootingSession.durationMs,
      successfulSteps: ticketData.context.troubleshootingSession.stepsSuccessful,
      totalSteps: ticketData.context.troubleshootingSession.stepsAttempted
    };

    return JSON.stringify(customData, null, 2);
  }

  private mapPriorityToJiraPriority(priority: string): string {
    switch (priority) {
      case 'critical': return 'Highest';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'Medium';
    }
  }

  private handleCreateTicketError(error: any, startTime: number): TicketCreationResult {
    const durationMs = Date.now() - startTime;
    const errorCode = error.code || ITSM_ERROR_CODES.TICKET_CREATION_FAILED;
    const isRetryable = this.isErrorRetryable(error);

    return {
      success: false,
      error: {
        code: errorCode,
        message: error.message || 'Failed to create Jira issue',
        details: error,
        retryable: isRetryable
      },
      timestamp: Date.now(),
      durationMs
    };
  }

  private handleConnectionTestError(error: any, startTime: number): ConnectionTestResult {
    const durationMs = Date.now() - startTime;
    const errorCode = error.code || ITSM_ERROR_CODES.CONNECTION_FAILED;

    return {
      success: false,
      message: error.message || 'Jira connection test failed',
      responseTimeMs: durationMs,
      error: {
        code: errorCode,
        message: error.message || 'Connection test failed'
      },
      timestamp: Date.now()
    };
  }
}