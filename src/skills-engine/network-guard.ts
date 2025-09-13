import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import { EventEmitter } from 'events';

// Network access control configuration
export interface NetworkGuardOptions {
  enabled: boolean;
  allowedHosts?: string[];
  blockedHosts?: string[];
  allowedPorts?: number[];
  blockedPorts?: number[];
  maxConnections?: number;
  maxBandwidthBytes?: number;
  dnsResolution?: boolean;
}

// Network access event
export interface NetworkAccessEvent {
  type: 'tcp_connection' | 'http_request' | 'https_request' | 'dns_lookup';
  host: string;
  port?: number;
  timestamp: number;
  allowed: boolean;
  bytesTransferred?: number;
  reason?: string;
}

/**
 * Network access guard for sandbox environment
 * Monitors and controls network access during script execution
 */
export class NetworkGuard extends EventEmitter {
  private accessEvents: NetworkAccessEvent[] = [];
  private bandwidthUsage = 0;
  private activeConnections = new Set<any>();
  private originalMethods: any = {};

  constructor(private options: NetworkGuardOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      enabled: true,
      allowedHosts: ['localhost', '127.0.0.1', '::1'],
      blockedHosts: [],
      allowedPorts: [],
      blockedPorts: [],
      maxConnections: 5,
      maxBandwidthBytes: 1024 * 1024, // 1MB
      dnsResolution: false,
      ...this.options
    };
  }

  /**
   * Enable network access monitoring
   */
  enableMonitoring(): void {
    if (!this.options.enabled) return;

    this.backupOriginalMethods();
    this.installHooks();
  }

  /**
   * Disable network access monitoring
   */
  disableMonitoring(): void {
    this.restoreOriginalMethods();
  }

  /**
   * Backup original network methods
   */
  private backupOriginalMethods(): void {
    this.originalMethods = {
      createConnection: net.createConnection,
      createServer: net.createServer,
      request: http.request,
      get: http.get,
      httpsRequest: https.request,
      httpsGet: https.get,
      lookup: dns.lookup,
      resolve: dns.resolve,
      resolve4: dns.resolve4,
      resolve6: dns.resolve6
    };
  }

  /**
   * Restore original network methods
   */
  private restoreOriginalMethods(): void {
    Object.assign(net, {
      createConnection: this.originalMethods.createConnection,
      createServer: this.originalMethods.createServer
    });

    Object.assign(http, {
      request: this.originalMethods.request,
      get: this.originalMethods.get
    });

    Object.assign(https, {
      request: this.originalMethods.httpsRequest,
      get: this.originalMethods.httpsGet
    });

    Object.assign(dns, {
      lookup: this.originalMethods.lookup,
      resolve: this.originalMethods.resolve,
      resolve4: this.originalMethods.resolve4,
      resolve6: this.originalMethods.resolve6
    });
  }

  /**
   * Install network access hooks
   */
  private installHooks(): void {
    // TCP connections
    net.createConnection = this.createTcpConnectionHook(net.createConnection);

    // HTTP requests
    http.request = this.createHttpRequestHook(http.request);
    http.get = this.createHttpRequestHook(http.get);

    // HTTPS requests
    https.request = this.createHttpRequestHook(https.request);
    https.get = this.createHttpRequestHook(https.get);

    // DNS resolution
    if (!this.options.dnsResolution) {
      this.blockDnsResolution();
    }
  }

  /**
   * Create TCP connection hook
   */
  private createTcpConnectionHook(originalMethod: Function): any {
    return (...args: any[]) => {
      const connectionInfo = this.parseConnectionArgs(args);

      if (!this.isConnectionAllowed(connectionInfo.host, connectionInfo.port, 'tcp')) {
        this.recordAccessEvent(
          'tcp_connection',
          connectionInfo.host,
          connectionInfo.port,
          false,
          'TCP connection blocked by sandbox policy'
        );
        throw new Error(`TCP connection to ${connectionInfo.host}:${connectionInfo.port} blocked by sandbox`);
      }

      if (this.activeConnections.size >= this.options.maxConnections!) {
        this.recordAccessEvent(
          'tcp_connection',
          connectionInfo.host,
          connectionInfo.port,
          false,
          'Maximum connections exceeded'
        );
        throw new Error('Maximum network connections exceeded');
      }

      this.recordAccessEvent(
        'tcp_connection',
        connectionInfo.host,
        connectionInfo.port,
        true
      );

      const socket = originalMethod.apply(net, args);
      this.monitorSocket(socket);
      return socket;
    };
  }

  /**
   * Create HTTP request hook
   */
  private createHttpRequestHook(originalMethod: Function): any {
    return (...args: any[]) => {
      const url = this.getUrlFromRequestArgs(args);

      if (!url) {
        return originalMethod.apply(this, args);
      }

      const host = url.hostname;
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);

      if (!this.isConnectionAllowed(host, port, 'http')) {
        this.recordAccessEvent(
          'http_request',
          host,
          port,
          false,
          'HTTP request blocked by sandbox policy'
        );
        throw new Error(`HTTP request to ${host}:${port} blocked by sandbox`);
      }

      this.recordAccessEvent(
        'http_request',
        host,
        port,
        true
      );

      const req = originalMethod.apply(this, args);
      this.monitorHttpRequest(req);
      return req;
    };
  }

  /**
   * Block DNS resolution
   */
  private blockDnsResolution(): void {
    const blockMethod = (methodName: string) => {
      return (...args: any[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          callback(new Error(`DNS resolution (${methodName}) is blocked in sandbox mode`));
        } else {
          throw new Error(`DNS resolution (${methodName}) is blocked in sandbox mode`);
        }
      };
    };

    dns.lookup = blockMethod('lookup');
    dns.resolve = blockMethod('resolve');
    dns.resolve4 = blockMethod('resolve4');
    dns.resolve6 = blockMethod('resolve6');
  }

  /**
   * Parse connection arguments
   */
  private parseConnectionArgs(args: any[]): { host: string; port: number } {
    if (args.length >= 2 && typeof args[0] === 'number') {
      return { host: 'localhost', port: args[0] };
    } else if (args.length >= 1 && typeof args[0] === 'object') {
      const options = args[0];
      return { host: options.host || 'localhost', port: options.port || 0 };
    } else if (args.length >= 2) {
      return { host: args[0], port: args[1] };
    }
    return { host: 'unknown', port: 0 };
  }

  /**
   * Get URL from HTTP request arguments
   */
  private getUrlFromRequestArgs(args: any[]): URL | null {
    try {
      if (typeof args[0] === 'string') {
        return new URL(args[0]);
      } else if (typeof args[0] === 'object' && args[0].host) {
        return new URL(`http://${args[0].host}`);
      } else if (typeof args[0] === 'object' && args[0].href) {
        return new URL(args[0].href);
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Check if connection is allowed
   */
  private isConnectionAllowed(host: string, port: number, type: string): boolean {
    // Check blocked hosts
    for (const blockedHost of this.options.blockedHosts || []) {
      if (host === blockedHost || host.endsWith(`.${blockedHost}`)) {
        return false;
      }
    }

    // Check blocked ports
    if (this.options.blockedPorts?.includes(port)) {
      return false;
    }

    // Check allowed hosts (if specified)
    if (this.options.allowedHosts && this.options.allowedHosts.length > 0) {
      let isAllowed = false;
      for (const allowedHost of this.options.allowedHosts) {
        if (host === allowedHost || host.endsWith(`.${allowedHost}`)) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) return false;
    }

    // Check allowed ports (if specified)
    if (this.options.allowedPorts && this.options.allowedPorts.length > 0) {
      if (!this.options.allowedPorts.includes(port)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Monitor socket for bandwidth usage
   */
  private monitorSocket(socket: net.Socket): void {
    this.activeConnections.add(socket);

    const originalWrite = socket.write;
    socket.write = (...args: any[]) => {
      const data = args[0];
      if (typeof data === 'string') {
        this.trackBandwidthUsage(data.length);
      } else if (Buffer.isBuffer(data)) {
        this.trackBandwidthUsage(data.length);
      }
      return originalWrite.apply(socket, args);
    };

    socket.on('data', (data: Buffer) => {
      this.trackBandwidthUsage(data.length);
    });

    socket.on('close', () => {
      this.activeConnections.delete(socket);
    });

    socket.on('error', () => {
      this.activeConnections.delete(socket);
    });
  }

  /**
   * Monitor HTTP request for bandwidth usage
   */
  private monitorHttpRequest(req: http.ClientRequest): void {
    req.on('response', (res: http.IncomingMessage) => {
      res.on('data', (data: Buffer) => {
        this.trackBandwidthUsage(data.length);
      });
    });

    req.on('finish', () => {
      // Track request body size if available
      if (req.outputData && req.outputData.length > 0) {
        let totalSize = 0;
        for (const chunk of req.outputData) {
          totalSize += chunk.length;
        }
        this.trackBandwidthUsage(totalSize);
      }
    });
  }

  /**
   * Track bandwidth usage
   */
  private trackBandwidthUsage(bytes: number): void {
    this.bandwidthUsage += bytes;

    if (this.bandwidthUsage > this.options.maxBandwidthBytes!) {
      this.emit('securityEvent', {
        type: 'bandwidth_exceeded',
        timestamp: Date.now(),
        details: `Bandwidth limit exceeded: ${this.bandwidthUsage} bytes`,
        severity: 'high'
      });

      // Close all active connections
      for (const socket of this.activeConnections) {
        try {
          socket.destroy();
        } catch {
          // Ignore errors during cleanup
        }
      }
      this.activeConnections.clear();

      throw new Error('Bandwidth limit exceeded');
    }
  }

  /**
   * Record network access event
   */
  private recordAccessEvent(
    type: NetworkAccessEvent['type'],
    host: string,
    port: number | undefined,
    allowed: boolean,
    reason?: string
  ): void {
    const event: NetworkAccessEvent = {
      type,
      host,
      port,
      timestamp: Date.now(),
      allowed,
      reason
    };

    this.accessEvents.push(event);
    this.emit('networkAccess', event);

    // Log security events for denied access
    if (!allowed) {
      this.emit('securityEvent', {
        type: 'network_access_denied',
        timestamp: Date.now(),
        details: `${type} to ${host}:${port} denied: ${reason}`,
        severity: 'high'
      });
    }
  }

  /**
   * Get all network access events
   */
  getAccessEvents(): NetworkAccessEvent[] {
    return [...this.accessEvents];
  }

  /**
   * Clear access events
   */
  clearAccessEvents(): void {
    this.accessEvents = [];
    this.bandwidthUsage = 0;
  }

  /**
   * Get current bandwidth usage
   */
  getBandwidthUsage(): number {
    return this.bandwidthUsage;
  }

  /**
   * Get active connections count
   */
  getActiveConnections(): number {
    return this.activeConnections.size;
  }
}