import { EventEmitter } from 'events';
import * as path from 'path';

// Behavior monitoring configuration
export interface BehaviorMonitorOptions {
  enabled: boolean;
  maxProcessSpawn: number;
  maxFileOperations: number;
  maxNetworkConnections: number;
  suspiciousPatterns: Array<{
    pattern: RegExp;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  processWhitelist: string[];
  fileOperationThresholdMs: number;
}

// Behavior event
export interface BehaviorEvent {
  type: 'process_spawn' | 'file_operation' | 'network_activity' | 'suspicious_pattern' | 'resource_abuse';
  timestamp: number;
  details: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
}

// Process spawn information
export interface ProcessSpawnInfo {
  command: string;
  args: string[];
  pid?: number;
}

/**
 * Behavior monitor for detecting malicious activity in sandbox
 */
export class BehaviorMonitor extends EventEmitter {
  private behaviorEvents: BehaviorEvent[] = [];
  private processSpawnCount = 0;
  private fileOperationCount = 0;
  private networkConnectionCount = 0;
  private processSpawns: ProcessSpawnInfo[] = [];
  private fileOperations: Array<{ operation: string; path: string; timestamp: number }> = [];
  private networkActivities: Array<{ type: string; host: string; port: number; timestamp: number }> = [];

  constructor(private options: BehaviorMonitorOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      enabled: true,
      maxProcessSpawn: 3,
      maxFileOperations: 50,
      maxNetworkConnections: 5,
      suspiciousPatterns: [
        {
          pattern: /Invoke-Expression|IEX/i,
          description: 'PowerShell Invoke-Expression (potential code injection)',
          severity: 'high'
        },
        {
          pattern: /DownloadFile|WebClient/i,
          description: 'File download attempt',
          severity: 'high'
        },
        {
          pattern: /New-Object.*Net\.WebClient/i,
          description: 'Web client object creation',
          severity: 'high'
        },
        {
          pattern: /Start-Process.*hidden/i,
          description: 'Hidden process execution',
          severity: 'high'
        },
        {
          pattern: /registry::/i,
          description: 'Registry access attempt',
          severity: 'medium'
        },
        {
          pattern: /certificate::/i,
          description: 'Certificate store access',
          severity: 'medium'
        },
        {
          pattern: /wsman::/i,
          description: 'WSMan access attempt',
          severity: 'medium'
        },
        {
          pattern: /comobject/i,
          description: 'COM object creation',
          severity: 'medium'
        },
        {
          pattern: /Add-Type/i,
          description: 'Dynamic type compilation',
          severity: 'medium'
        },
        {
          pattern: /Set-ExecutionPolicy/i,
          description: 'Execution policy modification',
          severity: 'high'
        }
      ],
      processWhitelist: [
        'powershell.exe',
        'cmd.exe',
        'sh',
        'bash',
        'python',
        'node',
        'npm',
        'npx'
      ],
      fileOperationThresholdMs: 100, // 100ms between file operations
      ...this.options
    };
  }

  /**
   * Monitor process spawn
   */
  monitorProcessSpawn(command: string, args: string[] = []): boolean {
    if (!this.options.enabled) return true;

    this.processSpawnCount++;
    const spawnInfo: ProcessSpawnInfo = { command, args, timestamp: Date.now() };
    this.processSpawns.push(spawnInfo);

    // Check process whitelist
    const baseCommand = path.basename(command).toLowerCase();
    if (!this.options.processWhitelist.includes(baseCommand)) {
      this.recordBehaviorEvent(
        'process_spawn',
        'high',
        0.8,
        `Non-whitelisted process spawn: ${command} ${args.join(' ')}`
      );
      return false;
    }

    // Check maximum process spawn count
    if (this.processSpawnCount > this.options.maxProcessSpawn) {
      this.recordBehaviorEvent(
        'process_spawn',
        'high',
        0.9,
        `Maximum process spawn count exceeded: ${this.processSpawnCount} > ${this.options.maxProcessSpawn}`
      );
      return false;
    }

    // Check for suspicious arguments
    const fullCommand = `${command} ${args.join(' ')}`;
    this.checkForSuspiciousPatterns(fullCommand);

    return true;
  }

  /**
   * Monitor file operation
   */
  monitorFileOperation(operation: string, filePath: string): boolean {
    if (!this.options.enabled) return true;

    this.fileOperationCount++;
    this.fileOperations.push({ operation, path: filePath, timestamp: Date.now() });

    // Check maximum file operations
    if (this.fileOperationCount > this.options.maxFileOperations) {
      this.recordBehaviorEvent(
        'file_operation',
        'high',
        0.8,
        `Maximum file operations exceeded: ${this.fileOperationCount} > ${this.options.maxFileOperations}`
      );
      return false;
    }

    // Check for rapid file operations (potential denial of service)
    if (this.fileOperations.length >= 2) {
      const lastOp = this.fileOperations[this.fileOperations.length - 1];
      const prevOp = this.fileOperations[this.fileOperations.length - 2];
      const timeDiff = lastOp.timestamp - prevOp.timestamp;

      if (timeDiff < this.options.fileOperationThresholdMs) {
        this.recordBehaviorEvent(
          'resource_abuse',
          'medium',
          0.7,
          `Rapid file operations detected: ${timeDiff}ms between operations`
        );
      }
    }

    // Check for suspicious file paths
    this.checkForSuspiciousPatterns(filePath);

    return true;
  }

  /**
   * Monitor network activity
   */
  monitorNetworkActivity(type: string, host: string, port: number): boolean {
    if (!this.options.enabled) return true;

    this.networkConnectionCount++;
    this.networkActivities.push({ type, host, port, timestamp: Date.now() });

    // Check maximum network connections
    if (this.networkConnectionCount > this.options.maxNetworkConnections) {
      this.recordBehaviorEvent(
        'network_activity',
        'high',
        0.8,
        `Maximum network connections exceeded: ${this.networkConnectionCount} > ${this.options.maxNetworkConnections}`
      );
      return false;
    }

    // Check for suspicious hosts or ports
    this.checkForSuspiciousPatterns(`${host}:${port}`);

    return true;
  }

  /**
   * Check for suspicious patterns in text
   */
  checkForSuspiciousPatterns(text: string): void {
    if (!this.options.enabled) return;

    for (const patternConfig of this.options.suspiciousPatterns) {
      if (patternConfig.pattern.test(text)) {
        this.recordBehaviorEvent(
          'suspicious_pattern',
          patternConfig.severity,
          0.9,
          `${patternConfig.description}: ${text.substring(0, 100)}...`
        );
        break;
      }
    }
  }

  /**
   * Monitor resource usage
   */
  monitorResourceUsage(cpuPercentage: number, memoryBytes: number): void {
    if (!this.options.enabled) return;

    // Detect resource abuse patterns
    if (cpuPercentage > 90) {
      this.recordBehaviorEvent(
        'resource_abuse',
        'medium',
        0.6,
        `High CPU usage detected: ${cpuPercentage}%`
      );
    }

    if (memoryBytes > 100 * 1024 * 1024) { // 100MB
      this.recordBehaviorEvent(
        'resource_abuse',
        'medium',
        0.7,
        `High memory usage detected: ${this.formatBytes(memoryBytes)}`
      );
    }
  }

  /**
   * Record behavior event
   */
  private recordBehaviorEvent(
    type: BehaviorEvent['type'],
    severity: BehaviorEvent['severity'],
    confidence: number,
    details: string
  ): void {
    const event: BehaviorEvent = {
      type,
      timestamp: Date.now(),
      details,
      severity,
      confidence
    };

    this.behaviorEvents.push(event);
    this.emit('behaviorEvent', event);

    // Emit security event for high severity events
    if (severity === 'high') {
      this.emit('securityEvent', {
        type: 'malicious_behavior',
        timestamp: Date.now(),
        details,
        severity: 'high'
      });
    }
  }

  /**
   * Get all behavior events
   */
  getBehaviorEvents(): BehaviorEvent[] {
    return [...this.behaviorEvents];
  }

  /**
   * Clear behavior events
   */
  clearBehaviorEvents(): void {
    this.behaviorEvents = [];
    this.processSpawnCount = 0;
    this.fileOperationCount = 0;
    this.networkConnectionCount = 0;
    this.processSpawns = [];
    this.fileOperations = [];
    this.networkActivities = [];
  }

  /**
   * Get process spawn statistics
   */
  getProcessSpawnStats(): {
    count: number;
    recent: ProcessSpawnInfo[];
    whitelistViolations: number;
  } {
    const whitelistViolations = this.processSpawns.filter(
      spawn => !this.options.processWhitelist.includes(path.basename(spawn.command).toLowerCase())
    ).length;

    return {
      count: this.processSpawnCount,
      recent: [...this.processSpawns].slice(-10), // Last 10 spawns
      whitelistViolations
    };
  }

  /**
   * Get file operation statistics
   */
  getFileOperationStats(): {
    count: number;
    recent: Array<{ operation: string; path: string; timestamp: number }>;
    operationsByType: Record<string, number>;
  } {
    const operationsByType: Record<string, number> = {};
    for (const op of this.fileOperations) {
      operationsByType[op.operation] = (operationsByType[op.operation] || 0) + 1;
    }

    return {
      count: this.fileOperationCount,
      recent: [...this.fileOperations].slice(-20), // Last 20 operations
      operationsByType
    };
  }

  /**
   * Get network activity statistics
   */
  getNetworkActivityStats(): {
    count: number;
    recent: Array<{ type: string; host: string; port: number; timestamp: number }>;
    connectionsByHost: Record<string, number>;
  } {
    const connectionsByHost: Record<string, number> = {};
    for (const activity of this.networkActivities) {
      connectionsByHost[activity.host] = (connectionsByHost[activity.host] || 0) + 1;
    }

    return {
      count: this.networkConnectionCount,
      recent: [...this.networkActivities].slice(-10), // Last 10 activities
      connectionsByHost
    };
  }

  /**
   * Format bytes for human-readable output
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Generate behavior summary report
   */
  generateSummaryReport(): {
    totalEvents: number;
    highSeverityEvents: number;
    processSpawns: number;
    fileOperations: number;
    networkConnections: number;
    securityScore: number;
  } {
    const highSeverityEvents = this.behaviorEvents.filter(event => event.severity === 'high').length;

    // Calculate security score (0-100)
    let securityScore = 100;
    if (highSeverityEvents > 0) securityScore -= highSeverityEvents * 20;
    if (this.processSpawnCount > this.options.maxProcessSpawn) securityScore -= 20;
    if (this.fileOperationCount > this.options.maxFileOperations) securityScore -= 20;
    if (this.networkConnectionCount > this.options.maxNetworkConnections) securityScore -= 20;
    securityScore = Math.max(0, securityScore);

    return {
      totalEvents: this.behaviorEvents.length,
      highSeverityEvents,
      processSpawns: this.processSpawnCount,
      fileOperations: this.fileOperationCount,
      networkConnections: this.networkConnectionCount,
      securityScore
    };
  }
}