import { TicketQueueItem, FeedbackQueueItem, QUEUE_ERROR_CODES } from './types';

export interface SyncAdapter {
  syncTicket(ticket: TicketQueueItem): Promise<void>;
  syncFeedback(feedback: FeedbackQueueItem): Promise<void>;
  testConnection(): Promise<boolean>;
}

export interface ServiceNowConfig {
  instance: string;
  username: string;
  password: string;
  tableName?: string;
  apiVersion?: string;
}

export interface JiraConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
  projectKey: string;
  issueType?: string;
}

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  ticketFormId?: string;
}

export interface SalesforceConfig {
  instanceUrl: string;
  accessToken: string;
  objectName?: string;
}

export class ServiceNowAdapter implements SyncAdapter {
  constructor(private config: ServiceNowConfig) {}

  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    const url = `https://${this.config.instance}.service-now.com/api/now/${this.config.apiVersion || 'v1'}/table/${this.config.tableName || 'incident'}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
      },
      body: JSON.stringify(this.mapTicketToServiceNow(ticket))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: ServiceNow API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.result || !result.result.sys_id) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: ServiceNow response invalid`);
    }
  }

  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    // ServiceNow doesn't have a standard feedback API, so we'll create a ticket
    const url = `https://${this.config.instance}.service-now.com/api/now/${this.config.apiVersion || 'v1'}/table/incident`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
      },
      body: JSON.stringify(this.mapFeedbackToServiceNow(feedback))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: ServiceNow feedback API error: ${response.status} ${response.statusText}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `https://${this.config.instance}.service-now.com/api/now/${this.config.apiVersion || 'v1'}/table/sys_user?sysparm_limit=1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private mapTicketToServiceNow(ticket: TicketQueueItem): any {
    return {
      short_description: ticket.ticketData.summary,
      description: ticket.ticketData.description,
      urgency: this.mapSeverityToUrgency(ticket.ticketData.severity),
      impact: this.mapSeverityToImpact(ticket.ticketData.severity),
      caller_id: ticket.ticketData.user.email || ticket.ticketData.user.name,
      comments: this.formatSkillResults(ticket.ticketData.skillResults),
      u_device_name: ticket.ticketData.systemInfo.deviceName,
      u_os_version: ticket.ticketData.systemInfo.osVersion,
      u_architecture: ticket.ticketData.systemInfo.architecture
    };
  }

  private mapFeedbackToServiceNow(feedback: FeedbackQueueItem): any {
    return {
      short_description: `User Feedback: ${feedback.feedbackData.rating}/5`,
      description: `Rating: ${feedback.feedbackData.rating}\nComment: ${feedback.feedbackData.comment}\nUser: ${feedback.feedbackData.userName} (${feedback.feedbackData.userId})`,
      urgency: '4', // Low urgency
      impact: '3', // Medium impact
      category: 'feedback',
      caller_id: feedback.feedbackData.userId
    };
  }

  private mapSeverityToUrgency(severity: string): string {
    switch (severity) {
      case 'critical': return '1';
      case 'high': return '2';
      case 'medium': return '3';
      default: return '4';
    }
  }

  private mapSeverityToImpact(severity: string): string {
    switch (severity) {
      case 'critical': return '1';
      case 'high': return '2';
      default: return '3';
    }
  }

  private formatSkillResults(results: any[]): string {
    return results.map(r =>
      `${r.skillId}: ${r.status}${r.output ? ' - ' + r.output : ''} (${r.executionTimeMs}ms)`
    ).join('\n');
  }
}

export class JiraAdapter implements SyncAdapter {
  constructor(private config: JiraConfig) {}

  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    const url = `${this.config.baseUrl}/rest/api/3/issue`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.apiToken}`).toString('base64')
      },
      body: JSON.stringify(this.mapTicketToJira(ticket))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Jira API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.key) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Jira response invalid`);
    }
  }

  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    // Jira doesn't have a standard feedback API, so we'll create an issue
    const url = `${this.config.baseUrl}/rest/api/3/issue`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.apiToken}`).toString('base64')
      },
      body: JSON.stringify(this.mapFeedbackToJira(feedback))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Jira feedback API error: ${response.status} ${response.statusText}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/rest/api/3/myself`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.config.username}:${this.config.apiToken}`).toString('base64')
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private mapTicketToJira(ticket: TicketQueueItem): any {
    return {
      fields: {
        project: {
          key: this.config.projectKey
        },
        issuetype: {
          name: this.config.issueType || 'Bug'
        },
        summary: ticket.ticketData.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: ticket.ticketData.description
                }
              ]
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '\nSkill Results:\n' + this.formatSkillResults(ticket.ticketData.skillResults)
                }
              ]
            }
          ]
        },
        priority: {
          name: this.mapSeverityToPriority(ticket.ticketData.severity)
        },
        labels: ['windows-troubleshooter', 'automated'],
        customfield_10000: ticket.ticketData.user.name, // Adjust custom field as needed
        customfield_10001: ticket.ticketData.systemInfo.deviceName
      }
    };
  }

  private mapFeedbackToJira(feedback: FeedbackQueueItem): any {
    return {
      fields: {
        project: {
          key: this.config.projectKey
        },
        issuetype: {
          name: 'Feedback'
        },
        summary: `User Feedback: ${feedback.feedbackData.rating}/5`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Rating: ${feedback.feedbackData.rating}\nComment: ${feedback.feedbackData.comment}\nUser: ${feedback.feedbackData.userName}`
                }
              ]
            }
          ]
        },
        priority: {
          name: 'Low'
        },
        labels: ['feedback', 'user-rating']
      }
    };
  }

  private mapSeverityToPriority(severity: string): string {
    switch (severity) {
      case 'critical': return 'Highest';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      default: return 'Low';
    }
  }

  private formatSkillResults(results: any[]): string {
    return results.map(r =>
      `• ${r.skillId}: ${r.status} (${r.executionTimeMs}ms)${r.output ? ' - ' + r.output.substring(0, 100) + '...' : ''}`
    ).join('\n');
  }
}

export class ZendeskAdapter implements SyncAdapter {
  constructor(private config: ZendeskConfig) {}

  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    const url = `https://${this.config.subdomain}.zendesk.com/api/v2/tickets.json`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64')
      },
      body: JSON.stringify({
        ticket: this.mapTicketToZendesk(ticket)
      })
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Zendesk API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.ticket || !result.ticket.id) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Zendesk response invalid`);
    }
  }

  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    // Zendesk doesn't have a separate feedback API, create a ticket
    const url = `https://${this.config.subdomain}.zendesk.com/api/v2/tickets.json`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64')
      },
      body: JSON.stringify({
        ticket: this.mapFeedbackToZendesk(feedback)
      })
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Zendesk feedback API error: ${response.status} ${response.statusText}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `https://${this.config.subdomain}.zendesk.com/api/v2/users/me.json`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64')
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private mapTicketToZendesk(ticket: TicketQueueItem): any {
    return {
      subject: ticket.ticketData.summary,
      comment: {
        body: `${ticket.ticketData.description}\n\nSkill Results:\n${this.formatSkillResults(ticket.ticketData.skillResults)}`
      },
      priority: this.mapSeverityToPriority(ticket.ticketData.severity),
      requester: {
        name: ticket.ticketData.user.name,
        email: ticket.ticketData.user.email
      },
      tags: ['windows-troubleshooter', 'automated'],
      custom_fields: [
        {
          id: 'device_name',
          value: ticket.ticketData.systemInfo.deviceName
        },
        {
          id: 'os_version',
          value: ticket.ticketData.systemInfo.osVersion
        }
      ]
    };
  }

  private mapFeedbackToZendesk(feedback: FeedbackQueueItem): any {
    return {
      subject: `User Feedback: ${feedback.feedbackData.rating}/5`,
      comment: {
        body: `Rating: ${feedback.feedbackData.rating}\nComment: ${feedback.feedbackData.comment}\nUser: ${feedback.feedbackData.userName}`
      },
      priority: 'low',
      type: 'question',
      tags: ['feedback', 'user-rating']
    };
  }

  private mapSeverityToPriority(severity: string): string {
    switch (severity) {
      case 'critical': return 'urgent';
      case 'high': return 'high';
      case 'medium': return 'normal';
      default: return 'low';
    }
  }

  private formatSkillResults(results: any[]): string {
    return results.map(r =>
      `• ${r.skillId}: ${r.status} (${r.executionTimeMs}ms)${r.output ? ' - ' + r.output : ''}`
    ).join('\n');
  }
}

export class SalesforceAdapter implements SyncAdapter {
  constructor(private config: SalesforceConfig) {}

  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    const url = `${this.config.instanceUrl}/services/data/v58.0/sobjects/${this.config.objectName || 'Case'}/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`
      },
      body: JSON.stringify(this.mapTicketToSalesforce(ticket))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Salesforce API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.id) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Salesforce response invalid`);
    }
  }

  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    // Salesforce doesn't have a standard feedback object, use Case
    const url = `${this.config.instanceUrl}/services/data/v58.0/sobjects/Case/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`
      },
      body: JSON.stringify(this.mapFeedbackToSalesforce(feedback))
    });

    if (!response.ok) {
      throw new Error(`${QUEUE_ERROR_CODES.SYNC_FAILED}: Salesforce feedback API error: ${response.status} ${response.statusText}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.config.instanceUrl}/services/data/v58.0/query?q=SELECT+Id+FROM+Case+LIMIT+1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private mapTicketToSalesforce(ticket: TicketQueueItem): any {
    return {
      Subject: ticket.ticketData.summary,
      Description: `${ticket.ticketData.description}\n\nSkill Results:\n${this.formatSkillResults(ticket.ticketData.skillResults)}`,
      Priority: this.mapSeverityToPriority(ticket.ticketData.severity),
      Origin: 'Windows Troubleshooter',
      SuppliedName: ticket.ticketData.user.name,
      SuppliedEmail: ticket.ticketData.user.email,
      Device_Name__c: ticket.ticketData.systemInfo.deviceName,
      OS_Version__c: ticket.ticketData.systemInfo.osVersion
    };
  }

  private mapFeedbackToSalesforce(feedback: FeedbackQueueItem): any {
    return {
      Subject: `User Feedback: ${feedback.feedbackData.rating}/5`,
      Description: `Rating: ${feedback.feedbackData.rating}\nComment: ${feedback.feedbackData.comment}\nUser: ${feedback.feedbackData.userName}`,
      Priority: 'Low',
      Type: 'Feedback',
      Origin: 'Windows Troubleshooter'
    };
  }

  private mapSeverityToPriority(severity: string): string {
    switch (severity) {
      case 'critical': return 'High';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      default: return 'Low';
    }
  }

  private formatSkillResults(results: any[]): string {
    return results.map(r =>
      `• ${r.skillId}: ${r.status} (${r.executionTimeMs}ms)${r.output ? ' - ' + r.output : ''}`
    ).join('\n');
  }
}

export class SyncAdapterFactory {
  static createServiceNowAdapter(config: ServiceNowConfig): ServiceNowAdapter {
    return new ServiceNowAdapter(config);
  }

  static createJiraAdapter(config: JiraConfig): JiraAdapter {
    return new JiraAdapter(config);
  }

  static createZendeskAdapter(config: ZendeskConfig): ZendeskAdapter {
    return new ZendeskAdapter(config);
  }

  static createSalesforceAdapter(config: SalesforceConfig): SalesforceAdapter {
    return new SalesforceAdapter(config);
  }
}