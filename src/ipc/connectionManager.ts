import { EventEmitter } from 'events';
import {
  ConnectionStateMessage,
  IPC_CONFIG
} from '../types/ipc';
import { IPCError } from './errorHandling';

interface ConnectionState {
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastHeartbeat: number;
  latency: number;
  retryCount: number;
  lastError?: Error;
}

interface ConnectionOptions {
  maxRetryAttempts?: number;
  reconnectDelayMs?: number;
  heartbeatTimeoutMs?: number;
}

type ConnectionStateListener = (state: ConnectionStateMessage) => void;

export class ConnectionManager extends EventEmitter {
  private state: ConnectionState = {
    status: 'disconnected',
    lastHeartbeat: 0,
    latency: 0,
    retryCount: 0
  };

  private options: Required<ConnectionOptions>;
  private heartbeatTimeout?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(options: ConnectionOptions = {}) {
    super();
    this.options = {
      maxRetryAttempts: options.maxRetryAttempts ?? IPC_CONFIG.MAX_RETRY_ATTEMPTS,
      reconnectDelayMs: options.reconnectDelayMs ?? 2000,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? IPC_CONFIG.HEARTBEAT_INTERVAL_MS * 3
    };
  }

  /**
   * Update connection state
   */
  private setState(
    status: ConnectionState['status'],
    updates: Partial<Omit<ConnectionState, 'status'>> = {}
  ): void {
    const previousState = this.state.status;
    this.state = {
      ...this.state,
      status,
      ...updates
    };

    if (previousState !== status) {
      this.emitStateChange();
    }

    this.emit('stateChange', this.state);
  }

  /**
   * Emit state change message
   */
  private emitStateChange(): void {
    const message: ConnectionStateMessage = {
      type: 'connection_state',
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      state: this.state.status,
      reason: this.state.lastError ? this.state.lastError.message : undefined
    };

    this.emit('ipcMessage', message);
  }

  /**
   * Handle successful connection
   */
  connected(latency: number = 0): void {
    this.clearTimeouts();
    this.setState('connected', {
      lastHeartbeat: Date.now(),
      latency,
      retryCount: 0,
      lastError: undefined
    });

    this.startHeartbeatMonitoring();
  }

  /**
   * Handle connection loss
   */
  disconnected(error?: Error): void {
    this.clearTimeouts();
    
    if (this.state.status === 'connected' || this.state.status === 'reconnecting') {
      this.setState('disconnected', {
        lastError: error,
        retryCount: this.state.retryCount + 1
      });

      if (!this.isShuttingDown && this.state.retryCount <= this.options.maxRetryAttempts) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Handle heartbeat received
   */
  heartbeatReceived(latency: number): void {
    if (this.state.status === 'connected') {
      this.setState('connected', {
        lastHeartbeat: Date.now(),
        latency
      });
      this.resetHeartbeatTimeout();
    }
  }

  /**
   * Start reconnection process
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    const delay = this.calculateReconnectDelay();
    
    this.setState('reconnecting', {
      lastError: undefined
    });

    this.reconnectTimeout = setTimeout(() => {
      this.emit('reconnectAttempt');
    }, delay);
  }

  /**
   * Calculate reconnect delay with exponential backoff
   */
  private calculateReconnectDelay(): number {
    const baseDelay = this.options.reconnectDelayMs;
    const exponent = Math.min(this.state.retryCount, 5); // Cap at 5 retries for backoff
    return baseDelay * Math.pow(2, exponent);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.resetHeartbeatTimeout();
  }

  /**
   * Reset heartbeat timeout
   */
  private resetHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    
    this.heartbeatTimeout = setTimeout(() => {
      this.handleHeartbeatTimeout();
    }, this.options.heartbeatTimeoutMs);
  }

  /**
   * Handle heartbeat timeout
   */
  private handleHeartbeatTimeout(): void {
    if (this.state.status === 'connected') {
      const error = IPCError.connectionLost('Heartbeat timeout - connection may be lost');
      this.disconnected(error);
    }
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    this.clearHeartbeatTimeout();
    this.clearReconnectTimeout();
  }

  /**
   * Clear heartbeat timeout
   */
  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }
  }

  /**
   * Clear reconnect timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.state.status === 'connected' && 
           Date.now() - this.state.lastHeartbeat < this.options.heartbeatTimeoutMs;
  }

  /**
   * Check if connection can be used
   */
  isAvailable(): boolean {
    return this.state.status === 'connected' && this.isHealthy();
  }

  /**
   * Shutdown connection manager
   */
  shutdown(): void {
    this.isShuttingDown = true;
    this.clearTimeouts();
    this.setState('disconnected');
    this.removeAllListeners();
  }

  /**
   * Add connection state listener
   */
  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.on('stateChange', listener);
    return () => this.off('stateChange', listener);
  }

  /**
   * Add IPC message listener
   */
  onIPCMessage(listener: ConnectionStateListener): () => void {
    this.on('ipcMessage', listener);
    return () => this.off('ipcMessage', listener);
  }

  /**
   * Add reconnect attempt listener
   */
  onReconnectAttempt(listener: () => void): () => void {
    this.on('reconnectAttempt', listener);
    return () => this.off('reconnectAttempt', listener);
  }
}

/**
 * Global connection manager instance
 */
let globalConnectionManager: ConnectionManager | null = null;

export function getConnectionManager(options?: ConnectionOptions): ConnectionManager {
  if (!globalConnectionManager) {
    globalConnectionManager = new ConnectionManager(options);
  }
  return globalConnectionManager;
}

export function shutdownConnectionManager(): void {
  if (globalConnectionManager) {
    globalConnectionManager.shutdown();
    globalConnectionManager = null;
  }
}