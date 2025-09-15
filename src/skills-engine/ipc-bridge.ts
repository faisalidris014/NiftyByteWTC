import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// IPC message types
export interface IPCMessage {
  type: string;
  messageId: string;
  timestamp: number;
  correlationId?: string;
  payload: any;
  signature?: string;
}

// IPC bridge configuration
export interface IPCBridgeOptions {
  secretKey: string;
  maxMessageSize: number;
  timeoutMs: number;
  maxRetries: number;
  enableEncryption: boolean;
  enableSigning: boolean;
}

// IPC connection state
export interface IPCConnectionState {
  connected: boolean;
  lastHeartbeat: number;
  messageCount: number;
  errorCount: number;
}

/**
 * Secure IPC bridge for sandbox communication
 * Provides encrypted and authenticated communication between processes
 */
export class IPCBridge extends EventEmitter {
  private connectionState: IPCConnectionState = {
    connected: false,
    lastHeartbeat: 0,
    messageCount: 0,
    errorCount: 0
  };

  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private options: IPCBridgeOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      secretKey: crypto.randomBytes(32).toString('hex'), // Default random key
      maxMessageSize: 1024 * 1024, // 1MB
      timeoutMs: 30000, // 30 seconds
      maxRetries: 3,
      enableEncryption: true,
      enableSigning: true,
      ...this.options
    };
  }

  /**
   * Connect to IPC channel
   */
  async connect(): Promise<void> {
    try {
      this.connectionState.connected = true;
      this.connectionState.lastHeartbeat = Date.now();

      // Start heartbeat monitoring
      this.startHeartbeat();

      this.emit('connected');
    } catch (error) {
      this.connectionState.connected = false;
      this.connectionState.errorCount++;
      throw error;
    }
  }

  /**
   * Disconnect from IPC channel
   */
  async disconnect(): Promise<void> {
    this.connectionState.connected = false;
    this.stopHeartbeat();

    // Reject all pending requests
    for (const [messageId, request] of this.pendingRequests) {
      request.reject(new Error('IPC connection closed'));
      clearTimeout(request.timeout);
    }
    this.pendingRequests.clear();

    this.emit('disconnected');
  }

  /**
   * Send message and wait for response
   */
  async sendRequest(type: string, payload: any, timeoutMs?: number): Promise<any> {
    if (!this.connectionState.connected) {
      throw new Error('IPC connection not established');
    }

    const messageId = this.generateMessageId();
    const message = this.createMessage(type, payload, messageId);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`IPC request timeout after ${timeoutMs || this.options.timeoutMs}ms`));
      }, timeoutMs || this.options.timeoutMs);

      this.pendingRequests.set(messageId, { resolve, reject, timeout });

      try {
        this.sendMessage(message);
      } catch (error) {
        this.pendingRequests.delete(messageId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Send message without waiting for response
   */
  sendMessage(type: string, payload: any): void {
    if (!this.connectionState.connected) {
      throw new Error('IPC connection not established');
    }

    const messageId = this.generateMessageId();
    const message = this.createMessage(type, payload, messageId);

    this.sendMessage(message);
  }

  /**
   * Handle incoming message
   */
  handleIncomingMessage(rawMessage: any): void {
    try {
      const message = this.validateAndDecodeMessage(rawMessage);

      if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
        // This is a response to a pending request
        const request = this.pendingRequests.get(message.correlationId);
        if (request) {
          clearTimeout(request.timeout);
          this.pendingRequests.delete(message.correlationId);
          request.resolve(message.payload);
        }
      } else {
        // This is a new incoming message
        this.emit('message', message);

        // Auto-respond to heartbeat messages
        if (message.type === 'heartbeat') {
          this.sendResponse(message.messageId, 'heartbeat_ack', { timestamp: Date.now() });
        }
      }

      this.connectionState.messageCount++;
      this.connectionState.lastHeartbeat = Date.now();

    } catch (error) {
      this.connectionState.errorCount++;
      this.emit('error', error);
    }
  }

  /**
   * Send response to a message
   */
  sendResponse(correlationId: string, type: string, payload: any): void {
    const message = this.createMessage(type, payload, this.generateMessageId(), correlationId);
    this.sendMessage(message);
  }

  /**
   * Create secure message
   */
  private createMessage(type: string, payload: any, messageId: string, correlationId?: string): IPCMessage {
    // Validate payload size
    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > this.options.maxMessageSize) {
      throw new Error(`Message payload too large: ${payloadSize} bytes > ${this.options.maxMessageSize} bytes`);
    }

    const message: IPCMessage = {
      type,
      messageId,
      timestamp: Date.now(),
      correlationId,
      payload
    };

    // Add signature if enabled
    if (this.options.enableSigning) {
      message.signature = this.signMessage(message);
    }

    // Encrypt payload if enabled
    if (this.options.enableEncryption) {
      message.payload = this.encryptPayload(message.payload);
    }

    return message;
  }

  /**
   * Validate and decode incoming message
   */
  private validateAndDecodeMessage(rawMessage: any): IPCMessage {
    if (typeof rawMessage !== 'object' || rawMessage === null) {
      throw new Error('Invalid message format');
    }

    const message = rawMessage as IPCMessage;

    // Validate required fields
    if (!message.type || !message.messageId || !message.timestamp) {
      throw new Error('Missing required message fields');
    }

    // Check message age (prevent replay attacks)
    const messageAge = Date.now() - message.timestamp;
    if (messageAge > 60000) { // 1 minute
      throw new Error('Message too old');
    }

    // Verify signature if enabled
    if (this.options.enableSigning && message.signature) {
      if (!this.verifyMessageSignature(message)) {
        throw new Error('Message signature verification failed');
      }
    }

    // Decrypt payload if enabled
    if (this.options.enableEncryption) {
      message.payload = this.decryptPayload(message.payload);
    }

    return message;
  }

  /**
   * Sign message for authentication
   */
  private signMessage(message: IPCMessage): string {
    const sign = crypto.createHmac('sha256', this.options.secretKey);
    const dataToSign = `${message.type}:${message.messageId}:${message.timestamp}:${JSON.stringify(message.payload)}`;
    return sign.update(dataToSign).digest('hex');
  }

  /**
   * Verify message signature
   */
  private verifyMessageSignature(message: IPCMessage): boolean {
    if (!message.signature) return false;

    const expectedSignature = this.signMessage({
      ...message,
      signature: undefined
    } as IPCMessage);

    return crypto.timingSafeEqual(
      Buffer.from(message.signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Encrypt payload
   */
  private encryptPayload(payload: any): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.options.secretKey.substring(0, 32), 'hex'),
      iv
    );

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      authTag: authTag.toString('hex')
    });
  }

  /**
   * Decrypt payload
   */
  private decryptPayload(encryptedPayload: string): any {
    try {
      const { iv, data, authTag } = JSON.parse(encryptedPayload);

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.options.secretKey.substring(0, 32), 'hex'),
        Buffer.from(iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'hex')),
        decipher.final()
      ]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      throw new Error('Failed to decrypt payload');
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.connectionState.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.options.timeoutMs * 2) {
        this.emit('error', new Error('Heartbeat timeout - connection may be lost'));
        this.disconnect();
      } else {
        // Send heartbeat
        this.sendMessage('heartbeat', { timestamp: Date.now() });
      }
    }, this.options.timeoutMs / 2);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send raw message (to be implemented by specific transport)
   */
  private sendMessage(message: IPCMessage): void {
    // This should be implemented by the specific transport layer
    // (e.g., Electron IPC, WebSockets, etc.)
    this.emit('sendMessage', message);
  }

  /**
   * Get connection state
   */
  getConnectionState(): IPCConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Get pending requests count
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Reset connection statistics
   */
  resetStatistics(): void {
    this.connectionState.messageCount = 0;
    this.connectionState.errorCount = 0;
  }

  /**
   * Generate new secret key
   */
  generateNewSecretKey(): string {
    this.options.secretKey = crypto.randomBytes(32).toString('hex');
    return this.options.secretKey;
  }
}