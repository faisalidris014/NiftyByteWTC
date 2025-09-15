// ITSM Integration Types and Interfaces

export interface ITSMCredentials {
  type: 'basic' | 'oauth2' | 'api_token' | 'service_account';
  username?: string;
  password?: string;
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  instanceUrl?: string;
  tenantId?: string;
}

export interface ITSMConnectionConfig {
  id: string;
  name: string;
  type: 'servicenow' | 'jira' | 'zendesk' | 'salesforce';
  baseUrl: string;
  credentials: ITSMCredentials;
  enabled: boolean;
  defaultPriority: 'low' | 'medium' | 'high' | 'critical';
  defaultCategory?: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  syncIntervalMs: number;
  createdAt: number;
  updatedAt: number;
  lastTestedAt?: number;
  lastTestStatus?: 'success' | 'failed';
  lastTestError?: string;
}

export interface StandardizedTicketPayload {
  // Core ticket information
  summary: string;
  description: string;
  category: string;
  subcategory?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact?: 'low' | 'medium' | 'high' | 'critical';
  urgency?: 'low' | 'medium' | 'high' | 'critical';

  // User information
  user: {
    id: string;
    name: string;
    email?: string;
    department?: string;
    location?: string;
    phone?: string;
  };

  // System information
  systemInfo: {
    osVersion: string;
    architecture: string;
    deviceName: string;
    deviceId: string;
    macAddress?: string;
    ipAddress?: string;
    domain?: string;
  };

  // Skill execution results
  skillResults: Array<{
    skillId: string;
    skillName: string;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    output?: string;
    executionTimeMs: number;
    startedAt: number;
    completedAt: number;
    error?: {
      code: string;
      message: string;
      details?: any;
    };
  }>;

  // Additional context
  context: {
    appVersion: string;
    sessionId: string;
    correlationId: string;
    troubleshootingSession: {
      startTime: number;
      endTime: number;
      durationMs: number;
      stepsAttempted: number;
      stepsSuccessful: number;
    };
    networkInfo?: {
      connectionType: string;
      signalStrength?: number;
      bandwidth?: number;
    };
  };

  // Attachments (base64 encoded)
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
    content: string; // base64 encoded
    description?: string;
  }>;

  // Custom fields for specific ITSM systems
  customFields?: Record<string, any>;
}

export interface ServiceNowTicket extends StandardizedTicketPayload {
  // ServiceNow specific fields
  assignmentGroup?: string;
  assignedTo?: string;
  shortDescription: string; // Alias for summary
  callerId?: string;
  cmdbCi?: string;
  businessService?: string;
  subcategory?: string;
}

export interface JiraTicket extends Omit<StandardizedTicketPayload, 'priority'> {
  // Jira specific fields
  projectKey: string;
  issueType: string;
  components?: string[];
  labels?: string[];
  assignee?: string;
  reporter?: string;
  dueDate?: string;
  environment?: string;
  affectsVersions?: string[];
  fixVersions?: string[];
  priority?: {
    name: string;
    id?: string;
  };
}

export interface TicketCreationResult {
  success: boolean;
  ticketId?: string;
  ticketNumber?: string;
  ticketUrl?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
    retryable: boolean;
  };
  timestamp: number;
  durationMs: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  responseTimeMs?: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: number;
}

export interface ITSMHealthStatus {
  connectionId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  lastTested: number;
  responseTimeMs?: number;
  errorRate?: number;
  queueLength?: number;
  message?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  retryableErrorCodes: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
  retryableErrorCodes: [
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMITED',
    'SERVER_ERROR',
    'SERVICE_UNAVAILABLE'
  ]
};

export const ITSM_ERROR_CODES = {
  // Connection errors
  CONNECTION_FAILED: 'ITSM_CONNECTION_FAILED',
  AUTHENTICATION_FAILED: 'ITSM_AUTHENTICATION_FAILED',
  INVALID_CREDENTIALS: 'ITSM_INVALID_CREDENTIALS',
  RATE_LIMITED: 'ITSM_RATE_LIMITED',

  // Ticket creation errors
  INVALID_TICKET_DATA: 'ITSM_INVALID_TICKET_DATA',
  TICKET_CREATION_FAILED: 'ITSM_TICKET_CREATION_FAILED',
  PERMISSION_DENIED: 'ITSM_PERMISSION_DENIED',

  // System errors
  SERVICE_UNAVAILABLE: 'ITSM_SERVICE_UNAVAILABLE',
  TIMEOUT: 'ITSM_TIMEOUT',
  NETWORK_ERROR: 'ITSM_NETWORK_ERROR',

  // Configuration errors
  INVALID_CONFIG: 'ITSM_INVALID_CONFIG',
  MISSING_REQUIRED_FIELD: 'ITSM_MISSING_REQUIRED_FIELD',

  // Retryable errors
  RETRYABLE_ERROR: 'ITSM_RETRYABLE_ERROR',

  // Success codes
  SUCCESS: 'ITSM_SUCCESS'
} as const;

export interface ITSMOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  validateSSL?: boolean;
  debug?: boolean;
  userAgent?: string;
}