import { ipcMain, IpcMainEvent } from 'electron';
import {
  IPCMessage,
  SkillExecutionRequest,
  SkillExecutionResponse,
  ConnectionStateMessage,
  HeartbeatMessage,
  HeartbeatAckMessage,
  IPC_CHANNELS,
  IPC_ERROR_CODES,
  IPC_CONFIG
} from '../types/ipc';

// Skill execution registry (to be populated with actual skill implementations)
interface SkillHandler {
  (params: Record<string, any>): Promise<string>;
}

const skillRegistry = new Map<string, SkillHandler>();

// Connection state tracking
let connectionState: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
let heartbeatInterval: NodeJS.Timeout | null = null;
let heartbeatSequence = 0;

/**
 * Register a skill handler
 */
export function registerSkill(skillId: string, handler: SkillHandler): void {
  skillRegistry.set(skillId, handler);
}

/**
 * Unregister a skill handler
 */
export function unregisterSkill(skillId: string): void {
  skillRegistry.delete(skillId);
}

/**
 * Validate IPC message structure
 */
function validateIPCMessage(message: any): message is IPCMessage {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.messageId === 'string' &&
    typeof message.timestamp === 'number' &&
    typeof message.type === 'string'
  );
}

/**
 * Send response to renderer process
 */
function sendResponse(event: IpcMainEvent, channel: string, response: any): void {
  if (!event.sender.isDestroyed()) {
    event.sender.send(channel, response);
  }
}

/**
 * Handle skill execution requests
 */
function handleSkillExecutionRequest(event: IpcMainEvent, request: SkillExecutionRequest): void {
  const { skillId, params, messageId, timeoutMs = IPC_CONFIG.DEFAULT_TIMEOUT_MS } = request;
  
  // Check if skill exists
  const skillHandler = skillRegistry.get(skillId);
  if (!skillHandler) {
    const errorResponse: SkillExecutionResponse = {
      type: 'skill_execution_response',
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      correlationId: messageId,
      skillId,
      status: 'error',
      error: {
        code: IPC_ERROR_CODES.SKILL_NOT_FOUND,
        message: `Skill '${skillId}' not found`
      }
    };
    sendResponse(event, IPC_CHANNELS.SKILL_EXECUTION_RESPONSE, errorResponse);
    return;
  }

  // Execute skill with timeout
  const executionStart = Date.now();
  const timeoutPromise = new Promise<SkillExecutionResponse>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Skill execution timeout'));
    }, timeoutMs);
  });

  const skillPromise = skillHandler(params)
    .then((output) => {
      const executionTime = Date.now() - executionStart;
      const response: SkillExecutionResponse = {
        type: 'skill_execution_response',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        correlationId: messageId,
        skillId,
        status: 'success',
        output,
        executionTimeMs: executionTime
      };
      return response;
    })
    .catch((error) => {
      const executionTime = Date.now() - executionStart;
      const response: SkillExecutionResponse = {
        type: 'skill_execution_response',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        correlationId: messageId,
        skillId,
        status: 'error',
        error: {
          code: IPC_ERROR_CODES.SKILL_EXECUTION_FAILED,
          message: error.message,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        executionTimeMs: executionTime
      };
      return response;
    });

  // Race between skill execution and timeout
  Promise.race([skillPromise, timeoutPromise])
    .then((response) => {
      sendResponse(event, IPC_CHANNELS.SKILL_EXECUTION_RESPONSE, response);
    })
    .catch((error) => {
      const response: SkillExecutionResponse = {
        type: 'skill_execution_response',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        correlationId: messageId,
        skillId,
        status: 'timeout',
        error: {
          code: IPC_ERROR_CODES.TIMEOUT,
          message: error.message
        }
      };
      sendResponse(event, IPC_CHANNELS.SKILL_EXECUTION_RESPONSE, response);
    });
}

/**
 * Handle heartbeat messages
 */
function handleHeartbeat(event: IpcMainEvent, message: HeartbeatMessage): void {
  const ack: HeartbeatAckMessage = {
    type: 'heartbeat_ack',
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
    correlationId: message.messageId,
    sequence: message.sequence,
    latencyMs: Date.now() - message.timestamp
  };
  sendResponse(event, IPC_CHANNELS.HEARTBEAT_ACK, ack);
}

/**
 * Start heartbeat mechanism
 */
function startHeartbeat(event: IpcMainEvent): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    if (!event.sender.isDestroyed()) {
      const heartbeat: HeartbeatMessage = {
        type: 'heartbeat',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        sequence: heartbeatSequence++
      };
      event.sender.send(IPC_CHANNELS.HEARTBEAT, heartbeat);
    }
  }, IPC_CONFIG.HEARTBEAT_INTERVAL_MS);
}

/**
 * Update connection state
 */
function updateConnectionState(
  event: IpcMainEvent,
  state: 'connected' | 'disconnected' | 'reconnecting',
  reason?: string
): void {
  connectionState = state;
  const message: ConnectionStateMessage = {
    type: 'connection_state',
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
    state,
    reason
  };
  sendResponse(event, IPC_CHANNELS.CONNECTION_STATE, message);
}

/**
 * Initialize all IPC handlers
 */
export function initializeIPCHandlers(): void {
  // Skill execution handler
  ipcMain.on(IPC_CHANNELS.SKILL_EXECUTION_REQUEST, (event, request) => {
    if (!validateIPCMessage(request) || request.type !== 'skill_execution_request') {
      const errorResponse: SkillExecutionResponse = {
        type: 'skill_execution_response',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        skillId: 'unknown',
        status: 'error',
        error: {
          code: IPC_ERROR_CODES.INVALID_MESSAGE,
          message: 'Invalid skill execution request format'
        }
      };
      sendResponse(event, IPC_CHANNELS.SKILL_EXECUTION_RESPONSE, errorResponse);
      return;
    }
    handleSkillExecutionRequest(event, request);
  });

  // Heartbeat handler
  ipcMain.on(IPC_CHANNELS.HEARTBEAT, (event, message) => {
    if (validateIPCMessage(message) && message.type === 'heartbeat') {
      handleHeartbeat(event, message);
    }
  });

  // Connection established handler
  ipcMain.on(IPC_CHANNELS.PING, (event) => {
    updateConnectionState(event, 'connected', 'Renderer process connected');
    startHeartbeat(event);
    
    // Send pong response
    event.sender.send(IPC_CHANNELS.PONG, {
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'pong'
    });
  });

  // Cleanup on renderer disconnect
  ipcMain.on('renderer-disconnected', () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    connectionState = 'disconnected';
  });
}

/**
 * Cleanup IPC handlers
 */
export function cleanupIPCHandlers(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  // Remove all IPC listeners
  Object.values(IPC_CHANNELS).forEach(channel => {
    ipcMain.removeAllListeners(channel);
  });
  
  ipcMain.removeAllListeners('renderer-disconnected');
}

/**
 * Get current connection state
 */
export function getConnectionState(): typeof connectionState {
  return connectionState;
}