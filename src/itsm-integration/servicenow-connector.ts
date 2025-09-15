import { BaseITSMCConnector } from './base-connector';
import {
  ITSMConnectionConfig,
  StandardizedTicketPayload,
  TicketCreationResult,
  ConnectionTestResult,
  ServiceNowTicket,
  ITSM_ERROR_CODES
} from './types';

interface ServiceNowIncident {
  short_description: string;
  description: string;
  urgency: string;
  impact: string;
  priority: string;
  category: string;
  subcategory?: string;
  assignment_group?: string;
  assigned_to?: string;
  caller_id?: string;
  cmdb_ci?: string;
  business_service?: string;
  comments?: string;
  work_notes?: string;
}

interface ServiceNowResponse {
  result: {
    sys_id: string;
    number: string;
    state: string;
    priority: string;
    urgency: string;
    impact: string;
    short_description: string;
    description: string;
    sys_created_on: string;
    sys_updated_on: string;
  };
}

export class ServiceNowConnector extends BaseITSMCConnector {
  private apiUrl: string;
  private authHeader: string;

  constructor(config: ITSMConnectionConfig) {
    super(config);
    this.apiUrl = `${config.baseUrl}/api/now/table/incident`;
    this.authHeader = this.createBasicAuthHeader(
      config.credentials.username!,
      config.credentials.password!
    );
  }

  async initialize(): Promise<void> {
    const configErrors = this.validateConfig();
    if (configErrors.length > 0) {
      throw new Error(`Invalid configuration: ${configErrors.join(', ')}`);
    }

    // Validate that we have basic auth credentials
    if (!this.config.credentials.username || !this.config.credentials.password) {
      throw new Error('ServiceNow requires username and password for basic authentication');
    }

    // Test connection during initialization
    const testResult = await this.testConnection();
    if (!testResult.success) {
      throw new Error(`ServiceNow connection test failed: ${testResult.message}`);
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

      // Convert to ServiceNow format
      const serviceNowTicket = this.mapToServiceNowFormat(ticketData);

      // Create ticket with retry mechanism
      const result = await this.withRetry(
        () => this.createServiceNowIncident(serviceNowTicket),
        'createServiceNowIncident'
      );

      return {
        success: true,
        ticketId: result.sys_id,
        ticketNumber: result.number,
        ticketUrl: `${this.config.baseUrl}/nav_to.do?uri=incident.do?sys_id=${result.sys_id}`,
        message: 'Ticket created successfully',
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
      const response = await fetch(`${this.apiUrl}?sysparm_limit=1`, {
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
          message: `ServiceNow API returned status ${response.status}: ${response.statusText}`,
          responseTimeMs: responseTime,
          error: {
            code: 'HTTP_' + response.status,
            message: response.statusText
          },
          timestamp: Date.now()
        };
      }

      return {
        success: true,
        message: 'ServiceNow connection test successful',
        responseTimeMs: responseTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return this.handleConnectionTestError(error, startTime);
    }
  }

  async close(): Promise<void> {
    this.isConnected = false;
    // ServiceNow doesn't require explicit connection closing
  }

  private async createServiceNowIncident(incident: ServiceNowIncident): Promise<any> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(incident),
      signal: AbortSignal.timeout(this.options.timeoutMs!)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`ServiceNow API error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    const result: ServiceNowResponse = await response.json();
    return result.result;
  }

  private mapToServiceNowFormat(ticketData: StandardizedTicketPayload): ServiceNowIncident {
    const now = new Date().toISOString();

    return {
      short_description: ticketData.summary,
      description: this.buildDescription(ticketData),
      urgency: this.mapPriorityToUrgency(ticketData.priority),
      impact: this.mapPriorityToImpact(ticketData.priority),
      priority: this.mapPriorityToServiceNowPriority(ticketData.priority),
      category: ticketData.category,
      subcategory: ticketData.subcategory,
      assignment_group: this.config.defaultCategory,
      caller_id: ticketData.user.email || ticketData.user.name,
      comments: this.buildComments(ticketData),
      work_notes: this.buildWorkNotes(ticketData)
    };
  }

  private buildDescription(ticketData: StandardizedTicketPayload): string {
    let description = ticketData.description + '\n\n';

    // Add user information
    description += `User: ${ticketData.user.name}`;
    if (ticketData.user.email) {
      description += ` (${ticketData.user.email})`;
    }
    description += '\n';

    // Add system information
    description += `Device: ${ticketData.systemInfo.deviceName}\n`;
    description += `OS: ${ticketData.systemInfo.osVersion} (${ticketData.systemInfo.architecture})\n`;
    if (ticketData.systemInfo.deviceId) {
      description += `Device ID: ${ticketData.systemInfo.deviceId}\n`;
    }

    // Add skill results
    if (ticketData.skillResults && ticketData.skillResults.length > 0) {
      description += '\nTroubleshooting Results:\n';
      ticketData.skillResults.forEach((result, index) => {
        description += `${index + 1}. ${result.skillName}: ${result.status}\n`;
        if (result.output) {
          description += `   Output: ${result.output.substring(0, 200)}${result.output.length > 200 ? '...' : ''}\n`;
        }
        if (result.error) {
          description += `   Error: ${result.error.message}\n`;
        }
      });
    }

    // Add context information
    description += `\nApp Version: ${ticketData.context.appVersion}\n`;
    description += `Session ID: ${ticketData.context.sessionId}\n`;

    return description;
  }

  private buildComments(ticketData: StandardizedTicketPayload): string {
    if (!ticketData.skillResults || ticketData.skillResults.length === 0) {
      return 'No troubleshooting steps performed';
    }

    let comments = 'Troubleshooting Steps:\n';
    ticketData.skillResults.forEach((result, index) => {
      comments += `${index + 1}. ${result.skillName} - ${result.status} (${result.executionTimeMs}ms)\n`;
      if (result.output) {
        comments += `   ${result.output.substring(0, 100)}${result.output.length > 100 ? '...' : ''}\n`;
      }
    });

    return comments;
  }

  private buildWorkNotes(ticketData: StandardizedTicketPayload): string {
    const notes = [
      `Generated by Windows Troubleshooting Companion v${ticketData.context.appVersion}`,
      `Session: ${ticketData.context.sessionId}`,
      `Correlation: ${ticketData.context.correlationId}`,
      `Duration: ${ticketData.context.troubleshootingSession.durationMs}ms`,
      `Steps: ${ticketData.context.troubleshootingSession.stepsSuccessful}/${ticketData.context.troubleshootingSession.stepsAttempted} successful`
    ];

    return notes.join('\n');
  }

  private mapPriorityToUrgency(priority: string): string {
    switch (priority) {
      case 'critical': return '1'; // High
      case 'high': return '2';     // Medium
      case 'medium': return '3';   // Low
      case 'low': return '4';      // Very Low
      default: return '3';         // Low
    }
  }

  private mapPriorityToImpact(priority: string): string {
    switch (priority) {
      case 'critical': return '1'; // High
      case 'high': return '2';     // Medium
      case 'medium': return '3';   // Low
      case 'low': return '4';      // Very Low
      default: return '3';         // Low
    }
  }

  private mapPriorityToServiceNowPriority(priority: string): string {
    switch (priority) {
      case 'critical': return '1'; // Critical
      case 'high': return '2';     // High
      case 'medium': return '3';   // Moderate
      case 'low': return '4';      // Low
      default: return '3';         // Moderate
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
        message: error.message || 'Failed to create ServiceNow ticket',
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
      message: error.message || 'ServiceNow connection test failed',
      responseTimeMs: durationMs,
      error: {
        code: errorCode,
        message: error.message || 'Connection test failed'
      },
      timestamp: Date.now()
    };
  }
}