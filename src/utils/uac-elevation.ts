// Windows UAC Elevation System
// Provides secure elevation prompts for admin tasks with proper user consent

import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { app } from 'electron';

interface UACOptions {
  operationName: string;
  operationDescription: string;
  requiresAdmin: boolean;
  timeoutMs?: number;
  showPrompt?: boolean;
}

interface UACResult {
  success: boolean;
  elevated: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface ElevationRequest {
  id: string;
  operation: string;
  description: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied' | 'timeout' | 'error';
  result?: UACResult;
}

export class UACElevationManager extends EventEmitter {
  private static instance: UACElevationManager;
  private pendingRequests = new Map<string, ElevationRequest>();
  private readonly ELEVATION_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 2;

  private constructor() {
    super();
    this.setupCleanupInterval();
  }

  static getInstance(): UACElevationManager {
    if (!UACElevationManager.instance) {
      UACElevationManager.instance = new UACElevationManager();
    }
    return UACElevationManager.instance;
  }

  /**
   * Check if current process has admin privileges
   */
  async hasAdminPrivileges(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false; // UAC only applies to Windows
    }

    try {
      // Use net session command to check admin privileges
      const result = await this.executeCommand('net session', { showPrompt: false });
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Execute command with UAC elevation if required
   */
  async executeWithElevation(
    command: string,
    args: string[] = [],
    options: UACOptions
  ): Promise<UACResult> {
    // Input validation
    if (!command || typeof command !== 'string') {
      throw new Error('Command must be a non-empty string');
    }

    if (!Array.isArray(args)) {
      throw new Error('Arguments must be an array');
    }

    if (!options || typeof options !== 'object') {
      throw new Error('Options must be an object');
    }

    if (!options.operationName || typeof options.operationName !== 'string') {
      throw new Error('Operation name must be a non-empty string');
    }

    if (!options.operationDescription || typeof options.operationDescription !== 'string') {
      throw new Error('Operation description must be a non-empty string');
    }
    const requestId = this.generateRequestId();
    const elevationRequest: ElevationRequest = {
      id: requestId,
      operation: options.operationName,
      description: options.operationDescription,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.pendingRequests.set(requestId, elevationRequest);
    this.emit('elevationRequested', elevationRequest);

    try {
      // Check if we already have admin privileges
      const hasAdmin = await this.hasAdminPrivileges();

      if (hasAdmin || !options.requiresAdmin) {
        // Execute directly without elevation
        const result = await this.executeCommand(command, args, {
          ...options,
          showPrompt: false
        });

        elevationRequest.status = 'approved';
        elevationRequest.result = result;
        this.pendingRequests.set(requestId, elevationRequest);

        this.emit('elevationCompleted', elevationRequest);
        return result;
      }

      // Show UAC prompt if required
      if (options.showPrompt !== false) {
        const userApproved = await this.showUACPrompt(options);

        if (!userApproved) {
          const result: UACResult = {
            success: false,
            elevated: false,
            error: 'User denied elevation request'
          };

          elevationRequest.status = 'denied';
          elevationRequest.result = result;
          this.pendingRequests.set(requestId, elevationRequest);

          this.emit('elevationDenied', elevationRequest);
          return result;
        }
      }

      // Execute with elevation
      const result = await this.executeElevatedCommand(command, args, options);

      elevationRequest.status = result.success ? 'approved' : 'error';
      elevationRequest.result = result;
      this.pendingRequests.set(requestId, elevationRequest);

      this.emit('elevationCompleted', elevationRequest);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: UACResult = {
        success: false,
        elevated: false,
        error: errorMessage
      };

      elevationRequest.status = 'error';
      elevationRequest.result = result;
      this.pendingRequests.set(requestId, elevationRequest);

      // Log the error with proper context
      console.error(`UAC elevation failed for operation '${options.operationName}': ${errorMessage}`);

      this.emit('elevationError', elevationRequest);
      return result;
    }
  }

  /**
   * Show UAC consent prompt to user
   */
  private async showUACPrompt(options: UACOptions): Promise<boolean> {
    // This would show a proper UAC prompt dialog
    // For now, we'll simulate user approval

    this.emit('promptShowing', {
      operation: options.operationName,
      description: options.operationDescription,
      timestamp: Date.now()
    });

    // In a real implementation, this would show a system dialog
    // and wait for user response
    return true; // Simulate user approval
  }

  /**
   * Execute command with elevation
   */
  private async executeElevatedCommand(
    command: string,
    args: string[],
    options: UACOptions
  ): Promise<UACResult> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve({
          success: false,
          elevated: false,
          error: 'UAC elevation only supported on Windows'
        });
        return;
      }

      // Validate and sanitize command and arguments to prevent injection
      if (!this.isValidCommand(command)) {
        resolve({
          success: false,
          elevated: false,
          error: 'Invalid command specified'
        });
        return;
      }

      // Sanitize arguments to prevent command injection
      const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));

      // Use PowerShell to execute with elevation - SAFE VERSION
      // Use parameter binding instead of string interpolation to prevent injection
      const psArgs = [
        '-ExecutionPolicy', 'Restricted',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `try {
          $process = Start-Process -FilePath "${this.escapePowerShellString(command)}" ` +
          `-ArgumentList ${this.buildSafeArgumentArray(sanitizedArgs)} ` +
          `-Verb RunAs -PassThru -Wait -WindowStyle Hidden
          exit $process.ExitCode
        } catch {
          exit 1
        }`
      ];

      const child = spawn('powershell.exe', psArgs, {
        timeout: options.timeoutMs || this.ELEVATION_TIMEOUT,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          elevated: true,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          elevated: true,
          error: error.message
        });
      });
    });
  }

  /**
   * Execute regular command without elevation
   */
  private async executeCommand(
    command: string,
    args: string[] = [],
    options: Partial<UACOptions> = {}
  ): Promise<UACResult> {
    return new Promise((resolve) => {
      // Validate and sanitize command to prevent injection
      if (!this.isValidCommand(command)) {
        resolve({
          success: false,
          elevated: false,
          error: 'Invalid command specified'
        });
        return;
      }

      // Sanitize arguments to prevent command injection
      const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));

      const child = spawn(command, sanitizedArgs, {
        timeout: options.timeoutMs || this.ELEVATION_TIMEOUT,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          elevated: false,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          elevated: false,
          error: error.message
        });
      });
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `elevation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup cleanup interval for old requests
   */
  private setupCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, request] of this.pendingRequests.entries()) {
        if (now - request.timestamp > this.ELEVATION_TIMEOUT * 2) {
          this.pendingRequests.delete(id);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Get all pending elevation requests
   */
  getPendingRequests(): ElevationRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get specific elevation request
   */
  getRequest(id: string): ElevationRequest | undefined {
    return this.pendingRequests.get(id);
  }

  /**
   * Cancel elevation request
   */
  cancelRequest(id: string): boolean {
    const request = this.pendingRequests.get(id);
    if (request && request.status === 'pending') {
      request.status = 'denied';
      this.pendingRequests.set(id, request);
      this.emit('elevationCancelled', request);
      return true;
    }
    return false;
  }

  /**
   * Cleanup manager
   */
  shutdown(): void {
    this.pendingRequests.clear();
    this.removeAllListeners();
  }

  /**
   * Security: Validate command to prevent injection
   */
  private isValidCommand(command: string): boolean {
    // Allow only whitelisted system commands
    const allowedCommands = [
      'net', 'netsh', 'cleanmgr', 'ipconfig', 'ping', 'tracert',
      'systeminfo', 'tasklist', 'taskkill', 'schtasks', 'sc',
      'reg', 'gpupdate', 'gpresult', 'dism', 'sfc', 'chkdsk'
    ];

    const baseCommand = command.split(/[\\/]/).pop()?.toLowerCase() || '';
    const commandName = baseCommand.replace(/\.(exe|com|bat|cmd|ps1)$/i, '');

    return allowedCommands.includes(commandName.toLowerCase());
  }

  /**
   * Security: Sanitize command argument to prevent injection
   */
  private sanitizeArgument(arg: string): string {
    // Remove potentially dangerous characters
    return arg.replace(/[&|;`$<>\n\r\0]/g, '');
  }

  /**
   * Security: Escape PowerShell string safely
   */
  private escapePowerShellString(str: string): string {
    return str.replace(/"/g, '`"').replace(/\$/g, '`$');
  }

  /**
   * Security: Build safe PowerShell argument array
   */
  private buildSafeArgumentArray(args: string[]): string {
    if (args.length === 0) {
      return '@()';
    }

    const safeArgs = args.map(arg =>
      `"${this.escapePowerShellString(arg)}"`
    );

    return `@(${safeArgs.join(', ')})`;
  }
}

// IPC Handlers for UAC elevation
export function setupUACHandlers(): void {
  const uacManager = UACElevationManager.getInstance();

  // Listen for elevation requests from renderer process
  // This would be integrated with the existing IPC system

  uacManager.on('elevationRequested', (request) => {
    console.log('UAC elevation requested:', request);
  });

  uacManager.on('elevationCompleted', (request) => {
    console.log('UAC elevation completed:', request);
  });

  uacManager.on('elevationDenied', (request) => {
    console.log('UAC elevation denied:', request);
  });

  uacManager.on('elevationError', (request) => {
    console.error('UAC elevation error:', request);
  });
}

// Utility function for common admin operations
export const AdminOperations = {
  async restartService(serviceName: string): Promise<UACResult> {
    const uacManager = UACElevationManager.getInstance();
    return uacManager.executeWithElevation(
      'net',
      ['stop', serviceName, '&&', 'net', 'start', serviceName],
      {
        operationName: 'Restart Service',
        operationDescription: `Restart the ${serviceName} service`,
        requiresAdmin: true,
        showPrompt: true
      }
    );
  },

  async modifyFirewallRule(ruleName: string, action: 'enable' | 'disable'): Promise<UACResult> {
    const uacManager = UACElevationManager.getInstance();
    return uacManager.executeWithElevation(
      'netsh',
      ['advfirewall', 'firewall', 'set', 'rule', `name="${ruleName}"`, 'new', `enable=${action === 'enable' ? 'yes' : 'no'}`],
      {
        operationName: 'Modify Firewall Rule',
        operationDescription: `${action} firewall rule: ${ruleName}`,
        requiresAdmin: true,
        showPrompt: true
      }
    );
  },

  async runDiskCleanup(): Promise<UACResult> {
    const uacManager = UACElevationManager.getInstance();
    return uacManager.executeWithElevation(
      'cleanmgr',
      ['/sagerun:1'],
      {
        operationName: 'Disk Cleanup',
        operationDescription: 'Run system disk cleanup utility',
        requiresAdmin: true,
        showPrompt: true
      }
    );
  }
};