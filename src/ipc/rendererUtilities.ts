import { ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IPCMessage,
  SkillExecutionRequest,
  SkillExecutionResponse,
  ConnectionStateMessage,
  HeartbeatMessage,
  HeartbeatAckMessage,
  IPC_CHANNELS,
  IPC_CONFIG
} from '../types/ipc';

// Type for IPC response handlers
type ResponseHandler<T> = (response: T) => void;
type ErrorHandler = (error: Error) => void;

// Pending request tracking
interface PendingRequest {
  resolve: ResponseHandler<any>;
  reject: ErrorHandler;
  timeoutId: NodeJS.Timeout;
}

const pendingRequests = new Map<string, PendingRequest>();
let connectionState: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
let heartbeatLatency: number = 0;

// Event listeners
const responseListeners = new Map<string, Set<ResponseHandler<any>>>();
const connectionStateListeners = new Set<ResponseHandler<ConnectionStateMessage>>();

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return crypto.randomUUID();
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
 * Send a message to the main process and wait for response
 */
export function sendRequest<T extends IPCMessage, R extends IPCMessage>(
  channel: string,
  message: Omit<T, 'messageId' | 'timestamp'>,
  timeoutMs: number = IPC_CONFIG.DEFAULT_TIMEOUT_MS
): Promise<R> {
  return new Promise((resolve, reject) => {
    const messageId = generateMessageId();
    const fullMessage: T = {
      ...message,
      messageId,
      timestamp: Date.now()
    } as T;

    const timeoutId = setTimeout(() => {
      pendingRequests.delete(messageId);
      reject(new Error(`IPC request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(messageId, {
      resolve: resolve as ResponseHandler<any>,
      reject,
      timeoutId
    });

    ipcRenderer.send(channel, fullMessage);
  });
}

/**
 * Execute a skill and wait for response
 */
export async function executeSkill(
  skillId: string,
  params: Record<string, any> = {},
  options: {
    timeoutMs?: number;
    requiresAdmin?: boolean;
  } = {}
): Promise<SkillExecutionResponse> {
  const request: Omit<SkillExecutionRequest, 'messageId' | 'timestamp'> = {
    type: 'skill_execution_request',
    skillId,
    params,
    requiresAdmin: options.requiresAdmin,
    timeoutMs: options.timeoutMs
  };

  return sendRequest<SkillExecutionRequest, SkillExecutionResponse>(
    IPC_CHANNELS.SKILL_EXECUTION_REQUEST,
    request,
    options.timeoutMs
  );
}

/**
 * Add listener for specific message types
 */
export function addListener<T extends IPCMessage>(
  channel: string,
  handler: ResponseHandler<T>
): () => void {
  if (!responseListeners.has(channel)) {
    responseListeners.set(channel, new Set());
  }
  responseListeners.get(channel)!.add(handler as ResponseHandler<any>);

  return () => {
    const listeners = responseListeners.get(channel);
    if (listeners) {
      listeners.delete(handler as ResponseHandler<any>);
      if (listeners.size === 0) {
        responseListeners.delete(channel);
      }
    }
  };
}

/**
 * Add connection state listener
 */
export function addConnectionStateListener(
  handler: ResponseHandler<ConnectionStateMessage>
): () => void {
  connectionStateListeners.add(handler);
  return () => {
    connectionStateListeners.delete(handler);
  };
}

/**
 * Get current connection state
 */
export function getConnectionState(): typeof connectionState {
  return connectionState;
}

/**
 * Get current heartbeat latency
 */
export function getHeartbeatLatency(): number {
  return heartbeatLatency;
}

/**
 * Initialize connection to main process
 */
export async function initializeConnection(
  timeoutMs: number = IPC_CONFIG.CONNECTION_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Connection initialization timeout'));
    }, timeoutMs);

    // Listen for pong response
    const removePongListener = addListener(IPC_CHANNELS.PONG, () => {
      clearTimeout(timeoutId);
      removePongListener();
      connectionState = 'connected';
      resolve();
    });

    // Send ping to main process
    ipcRenderer.send(IPC_CHANNELS.PING);
  });
}

/**
 * Handle incoming messages from main process
 */
function handleIncomingMessage(event: IpcRendererEvent, message: any): void {
  if (!validateIPCMessage(message)) {
    console.warn('Received invalid IPC message:', message);
    return;
  }

  // Handle correlation responses
  if (message.correlationId && pendingRequests.has(message.correlationId)) {
    const request = pendingRequests.get(message.correlationId)!;
    clearTimeout(request.timeoutId);
    pendingRequests.delete(message.correlationId);
    
    if (message.type === 'skill_execution_response' && (message as SkillExecutionResponse).status === 'error') {
      const error = new Error((message as SkillExecutionResponse).error?.message || 'Unknown error');
      request.reject(error);
    } else {
      request.resolve(message);
    }
    return;
  }

  // Handle broadcast messages
  const channelListeners = responseListeners.get(message.type);
  if (channelListeners) {
    channelListeners.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in IPC message handler:', error);
      }
    });
  }

  // Handle specific message types
  switch (message.type) {
    case 'connection_state':
      connectionState = (message as ConnectionStateMessage).state;
      connectionStateListeners.forEach(handler => {
        try {
          handler(message as ConnectionStateMessage);
        } catch (error) {
          console.error('Error in connection state handler:', error);
        }
      });
      break;

    case 'heartbeat_ack':
      heartbeatLatency = (message as HeartbeatAckMessage).latencyMs;
      break;

    case 'heartbeat':
      // Acknowledge heartbeat
      const ack: HeartbeatAckMessage = {
        type: 'heartbeat_ack',
        messageId: generateMessageId(),
        timestamp: Date.now(),
        correlationId: message.messageId,
        sequence: (message as HeartbeatMessage).sequence,
        latencyMs: Date.now() - message.timestamp
      };
      ipcRenderer.send(IPC_CHANNELS.HEARTBEAT_ACK, ack);
      break;
  }
}

/**
 * Initialize IPC listeners
 */
export function initializeIPCListeners(): void {
  // Listen for all IPC channels
  Object.values(IPC_CHANNELS).forEach(channel => {
    ipcRenderer.on(channel, handleIncomingMessage);
  });

  // Handle renderer process events
  window.addEventListener('beforeunload', () => {
    // Cleanup all pending requests
    pendingRequests.forEach((request, messageId) => {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Renderer process unloading'));
    });
    pendingRequests.clear();

    // Notify main process
    ipcRenderer.send('renderer-disconnected');
  });
}

/**
 * Cleanup IPC listeners
 */
export function cleanupIPCListeners(): void {
  // Remove all IPC listeners
  Object.values(IPC_CHANNELS).forEach(channel => {
    ipcRenderer.removeAllListeners(channel);
  });

  // Clear pending requests
  pendingRequests.forEach((request, messageId) => {
    clearTimeout(request.timeoutId);
    request.reject(new Error('IPC cleanup'));
  });
  pendingRequests.clear();

  // Clear listeners
  responseListeners.clear();
  connectionStateListeners.clear();
}