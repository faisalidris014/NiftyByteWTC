// ITSM Integration System Main Export

export * from './types';
export * from './base-connector';
export * from './servicenow-connector';
export * from './jira-connector';
export * from './credential-manager';
export * from './integration-manager';
export * from './connection-tester';
export * from './offline-queue-adapter';

// Re-export commonly used types for convenience
export {
  ITSMConnectionConfig,
  StandardizedTicketPayload,
  TicketCreationResult,
  ConnectionTestResult,
  ITSMHealthStatus,
  ITSMCredentials
} from './types';

// Default export for easy importing
export { ITSMIntegrationManager as default } from './integration-manager';