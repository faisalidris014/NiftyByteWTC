// IPC Message Types and Interfaces

export interface IPCMessageBase {
  messageId: string;
  timestamp: number;
  correlationId?: string;
}

export interface SkillExecutionRequest extends IPCMessageBase {
  type: 'skill_execution_request';
  skillId: string;
  params: Record<string, any>;
  requiresAdmin?: boolean;
  timeoutMs?: number;
}

export interface SkillExecutionResponse extends IPCMessageBase {
  type: 'skill_execution_response';
  skillId: string;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  output?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  executionTimeMs?: number;
}

export interface ConnectionStateMessage extends IPCMessageBase {
  type: 'connection_state';
  state: 'connected' | 'disconnected' | 'reconnecting';
  reason?: string;
}

export interface HeartbeatMessage extends IPCMessageBase {
  type: 'heartbeat';
  sequence: number;
}

export interface HeartbeatAckMessage extends IPCMessageBase {
  type: 'heartbeat_ack';
  sequence: number;
  latencyMs: number;
}

export interface ErrorMessage extends IPCMessageBase {
  type: 'error';
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
  context?: any;
}

export interface LogMessage extends IPCMessageBase {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: any;
}

export type IPCMessage =
  | SkillExecutionRequest
  | SkillExecutionResponse
  | ConnectionStateMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | ErrorMessage
  | LogMessage;

// IPC Channel Definitions
export const IPC_CHANNELS = {
  // Main skill execution channels
  SKILL_EXECUTION_REQUEST: 'skill-execution-request',
  SKILL_EXECUTION_RESPONSE: 'skill-execution-response',
  
  // Connection management
  CONNECTION_STATE: 'connection-state',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat-ack',
  
  // Error and logging
  ERROR: 'ipc-error',
  LOG: 'ipc-log',
  
  // Utility channels
  PING: 'ipc-ping',
  PONG: 'ipc-pong',
} as const;

// Error Codes
export const IPC_ERROR_CODES = {
  TIMEOUT: 'IPC_TIMEOUT',
  CONNECTION_LOST: 'IPC_CONNECTION_LOST',
  INVALID_MESSAGE: 'IPC_INVALID_MESSAGE',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_EXECUTION_FAILED: 'SKILL_EXECUTION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

// Configuration
export const IPC_CONFIG = {
  DEFAULT_TIMEOUT_MS: 30000, // 30 seconds
  HEARTBEAT_INTERVAL_MS: 5000, // 5 seconds
  MAX_RETRY_ATTEMPTS: 3,
  CONNECTION_TIMEOUT_MS: 10000, // 10 seconds
} as const;