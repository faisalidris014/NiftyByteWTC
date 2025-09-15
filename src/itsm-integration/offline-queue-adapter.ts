// Adapter to integrate the new ITSM system with the existing offline queue

import { ITSMIntegrationManager } from './integration-manager';
import { TicketQueueItem, FeedbackQueueItem } from '../offline-queue/types';
import { StandardizedTicketPayload } from './types';

// Define the SyncAdapter interface locally since it's not exported
interface SyncAdapter {
  syncTicket(ticket: TicketQueueItem): Promise<void>;
  syncFeedback(feedback: FeedbackQueueItem): Promise<void>;
  testConnection(): Promise<boolean>;
}

export class ITSMOfflineQueueAdapter implements SyncAdapter {
  private integrationManager: ITSMIntegrationManager;

  constructor(integrationManager: ITSMIntegrationManager) {
    this.integrationManager = integrationManager;
  }

  /**
   * Sync a ticket from the offline queue to ITSM systems
   */
  async syncTicket(ticket: TicketQueueItem): Promise<void> {
    try {
      // Convert offline queue ticket format to standardized ITSM format
      const standardizedTicket = this.mapToStandardizedFormat(ticket);

      // Create ticket using the ITSM integration manager
      const results = await this.integrationManager.createTicket(standardizedTicket);

      // Check if any connection succeeded
      const successfulConnections = Array.from(results.entries())
        .filter(([_, result]) => result.success);

      if (successfulConnections.length === 0) {
        // All connections failed, throw error to trigger retry
        const firstError = Array.from(results.values())[0]?.error;
        throw new Error(`All ITSM connections failed: ${firstError?.message}`);
      }

      console.log(`Ticket synced successfully to ${successfulConnections.length} ITSM system(s)`);

    } catch (error) {
      console.error('Failed to sync ticket to ITSM systems:', error);
      throw error;
    }
  }

  /**
   * Sync feedback from the offline queue to ITSM systems
   */
  async syncFeedback(feedback: FeedbackQueueItem): Promise<void> {
    try {
      // Convert feedback to a ticket format (since most ITSM systems don't have dedicated feedback APIs)
      const feedbackTicket = this.mapFeedbackToTicket(feedback);

      // Create feedback ticket using the ITSM integration manager
      const results = await this.integrationManager.createTicket(feedbackTicket);

      // Check if any connection succeeded
      const successfulConnections = Array.from(results.entries())
        .filter(([_, result]) => result.success);

      if (successfulConnections.length === 0) {
        // All connections failed, throw error to trigger retry
        const firstError = Array.from(results.values())[0]?.error;
        throw new Error(`All ITSM connections failed for feedback: ${firstError?.message}`);
      }

      console.log(`Feedback synced successfully to ${successfulConnections.length} ITSM system(s)`);

    } catch (error) {
      console.error('Failed to sync feedback to ITSM systems:', error);
      throw error;
    }
  }

  /**
   * Test connection to ITSM systems
   */
  async testConnection(): Promise<boolean> {
    try {
      const testResults = await this.integrationManager.testAllConnections();

      // Consider connection successful if at least one ITSM system is reachable
      const successfulTests = Array.from(testResults.values())
        .filter(result => result.success);

      return successfulTests.length > 0;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Map offline queue ticket format to standardized ITSM format
   */
  private mapToStandardizedFormat(ticket: TicketQueueItem): StandardizedTicketPayload {
    return {
      summary: ticket.ticketData.summary,
      description: ticket.ticketData.description,
      category: ticket.ticketData.category,
      priority: this.mapSeverityToPriority(ticket.ticketData.severity),
      user: {
        id: ticket.ticketData.user.id,
        name: ticket.ticketData.user.name,
        email: ticket.ticketData.user.email
        // department, location, and phone are optional and may not exist in the original type
      },
      systemInfo: {
        osVersion: ticket.ticketData.systemInfo.osVersion,
        architecture: ticket.ticketData.systemInfo.architecture,
        deviceName: ticket.ticketData.systemInfo.deviceName,
        deviceId: '' // deviceId is not in the original type, use empty string
        // macAddress, ipAddress, and domain are optional and may not exist
      },
      skillResults: ticket.ticketData.skillResults.map(result => ({
        skillId: result.skillId,
        skillName: result.skillId, // Use skillId as name if not available
        status: result.status,
        output: result.output,
        executionTimeMs: result.executionTimeMs,
        startedAt: Date.now() - result.executionTimeMs,
        completedAt: Date.now(),
        error: result.status === 'error' ? {
          code: 'SKILL_EXECUTION_ERROR',
          message: result.output || 'Unknown error'
        } : undefined
      })),
      context: {
        appVersion: '1.0.0', // Default version
        sessionId: ticket.id || 'unknown-session',
        correlationId: ticket.id || 'unknown-correlation',
        troubleshootingSession: {
          startTime: ticket.createdAt,
          endTime: ticket.updatedAt,
          durationMs: ticket.updatedAt - ticket.createdAt,
          stepsAttempted: ticket.ticketData.skillResults.length,
          stepsSuccessful: ticket.ticketData.skillResults.filter(r => r.status === 'success').length
        }
      },
      attachments: ticket.ticketData.attachments
    };
  }

  /**
   * Map feedback to ticket format for ITSM systems
   */
  private mapFeedbackToTicket(feedback: FeedbackQueueItem): StandardizedTicketPayload {
    return {
      summary: `User Feedback: ${feedback.feedbackData.rating}/5`,
      description: `User Rating: ${feedback.feedbackData.rating}\n\nComment: ${feedback.feedbackData.comment}\n\nContext: ${JSON.stringify(feedback.feedbackData.context, null, 2)}`,
      category: 'Feedback',
      priority: 'low',
      user: {
        id: feedback.feedbackData.userId,
        name: feedback.feedbackData.userName,
        email: feedback.feedbackData.userId.includes('@') ? feedback.feedbackData.userId : undefined
      },
      systemInfo: {
        osVersion: 'Unknown',
        architecture: 'Unknown',
        deviceName: 'Unknown',
        deviceId: 'feedback-' + feedback.id
      },
      skillResults: feedback.feedbackData.skillId ? [
        {
          skillId: feedback.feedbackData.skillId,
          skillName: feedback.feedbackData.skillId,
          status: 'success',
          executionTimeMs: 0,
          startedAt: feedback.createdAt,
          completedAt: feedback.updatedAt
        }
      ] : [],
      context: {
        appVersion: '1.0.0',
        sessionId: feedback.id,
        correlationId: feedback.id,
        troubleshootingSession: {
          startTime: feedback.createdAt,
          endTime: feedback.updatedAt,
          durationMs: feedback.updatedAt - feedback.createdAt,
          stepsAttempted: 1,
          stepsSuccessful: 1
        }
      }
    };
  }

  /**
   * Map severity to priority
   */
  private mapSeverityToPriority(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Get the integration manager instance
   */
  getIntegrationManager(): ITSMIntegrationManager {
    return this.integrationManager;
  }

  /**
   * Update integration manager configuration
   */
  updateIntegrationManager(newManager: ITSMIntegrationManager): void {
    this.integrationManager = newManager;
  }
}