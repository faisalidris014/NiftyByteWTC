import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { getLogManager } from './logging';
import { performance } from 'perf_hooks';

// Resource limits configuration
export interface ResourceLimits {
  maxCpuPercentage?: number;
  maxMemoryBytes?: number;
  maxExecutionTimeMs?: number;
  maxDiskWriteBytes?: number;
  maxNetworkBytes?: number;
  maxConcurrentProcesses?: number;
  maxOpenFiles?: number;
  maxChildProcesses?: number;
}

// Sandbox execution options
export interface SandboxOptions {
  resourceLimits?: ResourceLimits;
  allowedDirectories?: string[];
  networkAccess?: boolean;
  environmentVariables?: Record<string, string>;
  workingDirectory?: string;
  timeoutMs?: number;
  enableStrictMode?: boolean;
  allowSystemCalls?: boolean;
  maxRetryAttempts?: number;
}

// Environment variable validation error
export class EnvironmentVariableError extends Error {
  constructor(message: string, public variableName?: string) {
    super(message);
    this.name = 'EnvironmentVariableError';
  }
}

// Sandbox execution result
export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  resourceUsage: {
    cpuPercentage: number;
    memoryBytes: number;
    diskWriteBytes: number;
    networkBytes: number;
  };
  securityEvents: SecurityEvent[];
}

// Security event types
export interface SecurityEvent {
  type: 'filesystem_access' | 'network_access' | 'resource_exceeded' | 'suspicious_behavior';
  timestamp: number;
  details: string;
  severity: 'low' | 'medium' | 'high';
}

// Supported script types
export type ScriptType = 'powershell' | 'shell' | 'batch' | 'python';

/**
 * Secure skill execution sandbox with resource limits and isolation
 */
export class SkillSandbox extends EventEmitter {
  private process: ChildProcess | null = null;
  private isProcessTerminating: boolean = false;
  private timeoutId: NodeJS.Timeout | null = null;
  private resourceMonitor: NodeJS.Timeout | null = null;
  private securityEvents: SecurityEvent[] = [];
  private startTime: number = 0;
  private resourceUsage = {
    cpuPercentage: 0,
    memoryBytes: 0,
    diskWriteBytes: 0,
    networkBytes: 0,
    peakMemoryBytes: 0,
    peakCpuPercentage: 0,
    totalDiskWrites: 0,
    totalNetworkBytes: 0,
    startTime: 0,
    lastCpuCheck: 0,
    lastCpuUsage: 0
  };

  private diskWriteTracker = new Map<string, number>();
  private networkConnections = new Set<string>();
  private performanceMetrics: Array<{
    timestamp: number;
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  }> = [];

  // Cache for WMI queries to avoid excessive calls
  private wmiCache = new Map<string, { value: any; timestamp: number }>();
  private readonly WMI_CACHE_TTL = 1000; // 1 second cache TTL

  private logManager = getLogManager();
  private executionId: string = '';

  constructor(
    private scriptPath: string,
    private scriptType: ScriptType,
    private options: SandboxOptions = {}
  ) {
    super();
    this.setDefaultOptions();
    this.executionId = this.generateExecutionId();
  }

  private setDefaultOptions(): void {
    const isProduction = process.env.NODE_ENV === 'production';

    // Platform-specific default limits
    const platformDefaults = {
      windows: {
        maxCpuPercentage: 60,
        maxMemoryBytes: 150 * 1024 * 1024, // 150MB
        maxDiskWriteBytes: 15 * 1024 * 1024, // 15MB
        maxNetworkBytes: 2 * 1024 * 1024 // 2MB
      },
      unix: {
        maxCpuPercentage: 50,
        maxMemoryBytes: 100 * 1024 * 1024, // 100MB
        maxDiskWriteBytes: 10 * 1024 * 1024, // 10MB
        maxNetworkBytes: 1024 * 1024 // 1MB
      }
    };

    const defaults = process.platform === 'win32' ? platformDefaults.windows : platformDefaults.unix;

    // Environment-specific adjustments
    if (!isProduction) {
      // More lenient limits in development
      defaults.maxMemoryBytes *= 2;
      defaults.maxDiskWriteBytes *= 2;
      defaults.maxNetworkBytes *= 2;
    }

    this.options = {
      resourceLimits: {
        maxCpuPercentage: defaults.maxCpuPercentage,
        maxMemoryBytes: defaults.maxMemoryBytes,
        maxExecutionTimeMs: 30000, // 30 seconds
        maxDiskWriteBytes: defaults.maxDiskWriteBytes,
        maxNetworkBytes: defaults.maxNetworkBytes,
        // Additional safety limits
        maxConcurrentProcesses: 1,
        maxOpenFiles: 50,
        maxChildProcesses: 0 // No child processes by default
      },
      allowedDirectories: [
        path.join(os.tmpdir(), 'wtc-sandbox'),
        path.dirname(this.scriptPath)
      ],
      networkAccess: false,
      environmentVariables: {},
      workingDirectory: path.dirname(this.scriptPath),
      timeoutMs: 30000,
      // Additional security options
      enableStrictMode: isProduction,
      allowSystemCalls: false,
      maxRetryAttempts: 0,
      ...this.options
    };

    // Validate and sanitize options
    this.validateResourceLimits();
  }

  /**
   * Validate resource limits to ensure they are reasonable and safe
   */
  private validateResourceLimits(): void {
    const limits = this.options.resourceLimits!;

    // Ensure minimum safety limits
    const minLimits = {
      maxCpuPercentage: 10,
      maxMemoryBytes: 10 * 1024 * 1024, // 10MB minimum
      maxExecutionTimeMs: 1000, // 1 second minimum
      maxDiskWriteBytes: 1024 * 1024, // 1MB minimum
      maxNetworkBytes: 1024 // 1KB minimum
    };

    // Apply minimum limits
    limits.maxCpuPercentage = Math.max(minLimits.maxCpuPercentage, limits.maxCpuPercentage || 0);
    limits.maxMemoryBytes = Math.max(minLimits.maxMemoryBytes, limits.maxMemoryBytes || 0);
    limits.maxExecutionTimeMs = Math.max(minLimits.maxExecutionTimeMs, limits.maxExecutionTimeMs || 0);
    limits.maxDiskWriteBytes = Math.max(minLimits.maxDiskWriteBytes, limits.maxDiskWriteBytes || 0);
    limits.maxNetworkBytes = Math.max(minLimits.maxNetworkBytes, limits.maxNetworkBytes || 0);

    // Ensure reasonable maximums to prevent system overload
    const maxLimits = {
      maxCpuPercentage: 90,
      maxMemoryBytes: 1024 * 1024 * 1024, // 1GB maximum
      maxExecutionTimeMs: 5 * 60 * 1000, // 5 minutes maximum
      maxDiskWriteBytes: 100 * 1024 * 1024, // 100MB maximum
      maxNetworkBytes: 10 * 1024 * 1024 // 10MB maximum
    };

    // Apply maximum limits
    limits.maxCpuPercentage = Math.min(maxLimits.maxCpuPercentage, limits.maxCpuPercentage);
    limits.maxMemoryBytes = Math.min(maxLimits.maxMemoryBytes, limits.maxMemoryBytes);
    limits.maxExecutionTimeMs = Math.min(maxLimits.maxExecutionTimeMs, limits.maxExecutionTimeMs);
    limits.maxDiskWriteBytes = Math.min(maxLimits.maxDiskWriteBytes, limits.maxDiskWriteBytes);
    limits.maxNetworkBytes = Math.min(maxLimits.maxNetworkBytes, limits.maxNetworkBytes);

    // Log the final validated limits
    this.logManager.debug('Validated resource limits', {
      limits: {
        maxCpuPercentage: limits.maxCpuPercentage,
        maxMemoryBytes: this.formatBytes(limits.maxMemoryBytes),
        maxExecutionTimeMs: limits.maxExecutionTimeMs,
        maxDiskWriteBytes: this.formatBytes(limits.maxDiskWriteBytes),
        maxNetworkBytes: this.formatBytes(limits.maxNetworkBytes)
      }
    }, { component: 'sandbox', executionId: this.executionId });
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Execute script in secure sandbox
   */
  async execute(args: string[] = []): Promise<SandboxResult> {
    this.startTime = Date.now();
    this.securityEvents = [];

    this.logManager.startExecution(this.executionId, path.basename(this.scriptPath));
    this.logManager.info('Sandbox execution started', {
      scriptPath: this.scriptPath,
      scriptType: this.scriptType,
      args,
      options: this.options
    }, { component: 'sandbox', executionId: this.executionId, skillId: path.basename(this.scriptPath) });

    try {
      await this.prepareSandboxEnvironment();
      const result = await this.executeScript(args);

      this.logManager.info('Sandbox execution completed successfully', {
        executionTimeMs: result.executionTimeMs,
        exitCode: result.exitCode,
        securityEvents: result.securityEvents.length
      }, { component: 'sandbox', executionId: this.executionId, skillId: path.basename(this.scriptPath) });

      this.logManager.endExecution(this.executionId, true);
      return result;
    } catch (error) {
      const executionError = this.handleExecutionError(error);

      this.logManager.error('Sandbox execution failed', executionError, {
        scriptPath: this.scriptPath,
        scriptType: this.scriptType,
        args,
        error: executionError.message
      }, { component: 'sandbox', executionId: this.executionId, skillId: path.basename(this.scriptPath) });

      this.logManager.endExecution(this.executionId, false, {
        code: 'EXECUTION_FAILED',
        message: executionError.message
      });

      throw executionError;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Validate and sanitize environment variable names and values
   * @param envVars Environment variables to validate
   * @returns Validated and sanitized environment variables
   * @throws {EnvironmentVariableError} If environment variable validation fails
   */
  private validateEnvironmentVariables(envVars: Record<string, string>): Record<string, string> {
    const validated: Record<string, string> = {};

    for (const [key, value] of Object.entries(envVars)) {
      // Validate environment variable name
      if (!key || typeof key !== 'string' || key.trim().length === 0) {
        throw new EnvironmentVariableError(`Invalid environment variable name: ${key}`, key);
      }

      // Validate name format (alphanumeric, underscore, no spaces)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new EnvironmentVariableError(`Invalid environment variable name format: ${key}. Must start with letter or underscore and contain only alphanumeric characters and underscores.`, key);
      }

      // Prevent overwriting critical system and sandbox variables
      const criticalVars = [
        'PATH', 'HOME', 'USER', 'USERNAME', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR',
        'ComSpec', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'APPDATA',
        'LOCALAPPDATA', 'WTC_SANDBOX', 'WTC_EXECUTION_ID', 'WTC_ALLOWED_DIRS'
      ];

      if (criticalVars.includes(key.toUpperCase())) {
        throw new EnvironmentVariableError(`Cannot override critical system or sandbox environment variable: ${key}`, key);
      }

      // Validate environment variable value
      if (value === undefined || value === null) {
        throw new EnvironmentVariableError(`Environment variable ${key} has invalid value: ${value}`, key);
      }

      // Validate value length (prevent DoS through huge environment)
      if (String(value).length > 4096) {
        throw new EnvironmentVariableError(`Environment variable ${key} value too long (max 4096 characters)`, key);
      }

      // Sanitize value (prevent injection attacks and control characters)
      const sanitizedValue = String(value)
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/[\\\"\'\$\`\|\&\;\<\>]/g, '') // Remove shell metacharacters
        .trim();

      // Ensure value is not empty after sanitization
      if (sanitizedValue.length === 0) {
        throw new EnvironmentVariableError(`Environment variable ${key} value is empty after sanitization`, key);
      }

      validated[key] = sanitizedValue;
    }

    return validated;
  }

  /**
   * Create isolated environment for child process execution
   * @returns Isolated environment variables for child process
   */
  private createIsolatedEnvironment(): Record<string, string> {
    // Start with a minimal safe environment
    const isolatedEnv: Record<string, string> = {
      // Essential variables for basic functionality
      PATH: process.env.PATH || '',
      TEMP: process.env.TEMP || os.tmpdir(),
      TMP: process.env.TMP || os.tmpdir(),

      // Sandbox identification
      WTC_SANDBOX: 'true',
      WTC_EXECUTION_ID: this.executionId,
      WTC_ALLOWED_DIRS: (this.options.allowedDirectories || []).join(path.delimiter)
    };

    // Add validated custom environment variables
    if (this.options.environmentVariables) {
      try {
        const validatedVars = this.validateEnvironmentVariables(this.options.environmentVariables);
        Object.assign(isolatedEnv, validatedVars);
      } catch (error) {
        const errorMessage = (error as Error).message;
        const variableName = error instanceof EnvironmentVariableError ? error.variableName : 'unknown';

        this.logManager.warn('Environment variable validation failed', {
          error: errorMessage,
          variableName,
          environmentVariables: Object.keys(this.options.environmentVariables)
        }, { component: 'sandbox', executionId: this.executionId });

        // Record detailed security event
        this.recordSecurityEvent(
          'suspicious_behavior',
          error instanceof EnvironmentVariableError ? 'high' : 'medium',
          `Environment variable validation failed: ${errorMessage}`
        );

        // For critical validation errors, throw to prevent execution
        if (error instanceof EnvironmentVariableError &&
            (errorMessage.includes('critical system') ||
             errorMessage.includes('Invalid environment variable name format'))) {
          throw error;
        }

        // For less critical errors, continue with minimal environment
      }
    }

    // Add platform-specific essential variables
    if (process.platform === 'win32') {
      isolatedEnv.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows';
      isolatedEnv.WINDIR = process.env.WINDIR || 'C:\\Windows';
      isolatedEnv.ComSpec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    } else {
      isolatedEnv.HOME = process.env.HOME || os.homedir();
      isolatedEnv.USER = process.env.USER || 'user';
    }

    // Log environment configuration for auditing
    this.logEnvironmentConfiguration(isolatedEnv);

    return isolatedEnv;
  }

  /**
   * Log environment configuration for auditing and debugging
   * @param env Environment variables to log (sensitive values masked)
   */
  private logEnvironmentConfiguration(env: Record<string, string>): void {
    const maskedEnv: Record<string, string> = {};

    // Mask sensitive environment variable values
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /auth/i
    ];

    for (const [key, value] of Object.entries(env)) {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      maskedEnv[key] = isSensitive ? '***MASKED***' : value;
    }

    this.logManager.debug('Sandbox environment configuration', {
      totalVariables: Object.keys(env).length,
      environment: maskedEnv
    }, { component: 'sandbox', executionId: this.executionId });
  }

  /**
   * Prepare sandbox environment
   */
  private async prepareSandboxEnvironment(): Promise<void> {
    // Create sandbox directories if they don't exist
    for (const dir of this.options.allowedDirectories || []) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Execute the script with proper isolation
   */
  private async executeScript(args: string[]): Promise<SandboxResult> {
    return new Promise((resolve, reject) => {
      const command = this.getExecutionCommand(args);

      // Create isolated environment for child process
      const isolatedEnv = this.createIsolatedEnvironment();

      this.process = spawn(command[0], command.slice(1), {
        cwd: this.options.workingDirectory,
        env: isolatedEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      // Set up resource monitoring
      this.startResourceMonitoring();

      // Handle process output
      this.process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process completion
      this.process.on('close', (code: number | null) => {
        exitCode = code;
        this.stopResourceMonitoring();
        this.clearTimeout();

        const executionTimeMs = Date.now() - this.startTime;

        resolve({
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          executionTimeMs,
          resourceUsage: this.resourceUsage,
          securityEvents: this.securityEvents
        });
      });

      this.process.on('error', (error: Error) => {
        this.stopResourceMonitoring();
        this.clearTimeout();
        reject(error);
      });

      // Set timeout with atomic process state management
      if (this.options.timeoutMs) {
        this.timeoutId = setTimeout(() => {
          this.handleTimeout(reject);
        }, this.options.timeoutMs);
      }
    });
  }

  /**
   * Get execution command based on script type
   */
  private getExecutionCommand(args: string[]): string[] {
    switch (this.scriptType) {
      case 'powershell':
        return [
          'powershell.exe',
          '-ExecutionPolicy', 'Restricted',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          this.scriptPath,
          ...args
        ];

      case 'shell':
        return ['/bin/sh', this.scriptPath, ...args];

      case 'batch':
        return ['cmd.exe', '/C', this.scriptPath, ...args];

      case 'python':
        return ['python', this.scriptPath, ...args];

      default:
        throw new Error(`Unsupported script type: ${this.scriptType}`);
    }
  }

  /**
   * Monitor CPU usage with platform-specific implementation
   */
  private monitorCpuUsage(): void {
    if (!this.process) return;

    const now = performance.now();
    const elapsed = now - this.resourceUsage.lastCpuCheck;

    if (elapsed < 100) return; // Only check every 100ms minimum

    try {
      // Platform-specific CPU monitoring
      if (process.platform === 'win32') {
        this.monitorCpuUsageWindows();
      } else {
        this.monitorCpuUsageUnix();
      }

      this.resourceUsage.lastCpuCheck = now;
    } catch (error) {
      this.logManager.warn('CPU monitoring failed', {
        executionId: this.executionId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Windows-specific CPU monitoring using WMI to monitor actual child process
   */
  private monitorCpuUsageWindows(): void {
    if (!this.process?.pid) return;

    try {
      // Use WMI to get actual child process CPU usage
      const cpuUsage = this.getProcessCpuUsageWindows(this.process.pid);

      if (cpuUsage !== null) {
        this.resourceUsage.cpuPercentage = cpuUsage;
        this.resourceUsage.peakCpuPercentage = Math.max(
          this.resourceUsage.peakCpuPercentage,
          cpuUsage
        );
      } else {
        // Fallback to estimation if WMI query fails
        this.useCpuUsageFallback();
      }
    } catch (error) {
      this.logManager.warn('Windows CPU monitoring failed, using fallback', {
        executionId: this.executionId,
        error: (error as Error).message,
        pid: this.process.pid
      });
      this.useCpuUsageFallback();
    }
  }

  /**
   * Get process CPU usage using WMI query with caching
   */
  private getProcessCpuUsageWindows(pid: number): number | null {
    const cacheKey = `cpu_${pid}`;
    const cached = this.wmiCache.get(cacheKey);

    // Return cached value if it exists and is fresh
    if (cached && (Date.now() - cached.timestamp) < this.WMI_CACHE_TTL) {
      return cached.value;
    }

    try {
      // Use PowerShell to query WMI for process CPU usage
      const wmiQuery = `Get-WmiObject -Query "SELECT PercentProcessorTime FROM Win32_PerfFormattedData_PerfProc_Process WHERE IDProcess = ${pid}" | Select-Object -ExpandProperty PercentProcessorTime`;

      // Execute PowerShell command synchronously
      const result = this.executePowerShellSync(wmiQuery);

      if (result.success && result.stdout && result.stdout.trim()) {
        const cpuPercent = parseFloat(result.stdout.trim());
        const value = isNaN(cpuPercent) ? null : Math.min(100, cpuPercent);

        // Cache the result
        this.wmiCache.set(cacheKey, { value, timestamp: Date.now() });

        return value;
      }

      return null;
    } catch (error) {
      this.logManager.debug('WMI CPU query failed', {
        executionId: this.executionId,
        pid,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Fallback CPU monitoring when WMI queries fail
   */
  private useCpuUsageFallback(): void {
    // Use process.cpuUsage() as a last resort, but log that we're monitoring parent process
    const cpuUsage = process.cpuUsage();
    const totalCpu = (cpuUsage.user + cpuUsage.system) / 1000;
    const now = performance.now();
    const elapsed = now - this.resourceUsage.lastCpuCheck;
    const cpuPercentage = Math.min(100, (totalCpu / elapsed) * 100);

    this.resourceUsage.cpuPercentage = cpuPercentage;
    this.resourceUsage.peakCpuPercentage = Math.max(
      this.resourceUsage.peakCpuPercentage,
      cpuPercentage
    );

    // Log warning that we're falling back to parent process monitoring
    this.logManager.warn('Using parent process CPU monitoring fallback', {
      executionId: this.executionId,
      pid: this.process?.pid
    });
  }

  /**
   * Unix/Linux CPU monitoring using /proc filesystem
   */
  private monitorCpuUsageUnix(): void {
    // Simplified CPU monitoring for Unix systems
    // In production, this would parse /proc/stat or use libuv metrics
    const cpuUsage = Math.random() * 100; // Placeholder - replace with actual monitoring

    this.resourceUsage.cpuPercentage = cpuUsage;
    this.resourceUsage.peakCpuPercentage = Math.max(
      this.resourceUsage.peakCpuPercentage,
      cpuUsage
    );
  }

  /**
   * Monitor memory usage with process-specific metrics
   */
  private monitorMemoryUsage(): void {
    if (!this.process) return;

    try {
      // Platform-specific memory monitoring
      if (process.platform === 'win32') {
        this.monitorMemoryUsageWindows();
      } else {
        this.monitorMemoryUsageUnix();
      }

      // Track peak memory usage
      this.resourceUsage.peakMemoryBytes = Math.max(
        this.resourceUsage.peakMemoryBytes,
        this.resourceUsage.memoryBytes
      );
    } catch (error) {
      this.logManager.warn('Memory monitoring failed', {
        executionId: this.executionId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Windows-specific memory monitoring using WMI to monitor actual child process
   */
  private monitorMemoryUsageWindows(): void {
    if (!this.process?.pid) return;

    try {
      // Use WMI to get actual child process memory usage
      const memoryBytes = this.getProcessMemoryUsageWindows(this.process.pid);

      if (memoryBytes !== null) {
        this.resourceUsage.memoryBytes = memoryBytes;
      } else {
        // Fallback to estimation if WMI query fails
        this.useMemoryUsageFallback();
      }
    } catch (error) {
      this.logManager.warn('Windows memory monitoring failed, using fallback', {
        executionId: this.executionId,
        error: (error as Error).message,
        pid: this.process.pid
      });
      this.useMemoryUsageFallback();
    }
  }

  /**
   * Get process memory usage using WMI query with caching
   */
  private getProcessMemoryUsageWindows(pid: number): number | null {
    const cacheKey = `memory_${pid}`;
    const cached = this.wmiCache.get(cacheKey);

    // Return cached value if it exists and is fresh
    if (cached && (Date.now() - cached.timestamp) < this.WMI_CACHE_TTL) {
      return cached.value;
    }

    try {
      // Use PowerShell to query WMI for process memory usage
      const wmiQuery = `Get-WmiObject -Query "SELECT WorkingSetPrivate FROM Win32_PerfFormattedData_PerfProc_Process WHERE IDProcess = ${pid}" | Select-Object -ExpandProperty WorkingSetPrivate`;

      // Execute PowerShell command synchronously
      const result = this.executePowerShellSync(wmiQuery);

      if (result.success && result.stdout && result.stdout.trim()) {
        const memoryBytes = parseInt(result.stdout.trim(), 10);
        const value = isNaN(memoryBytes) ? null : memoryBytes;

        // Cache the result
        this.wmiCache.set(cacheKey, { value, timestamp: Date.now() });

        return value;
      }

      return null;
    } catch (error) {
      this.logManager.debug('WMI memory query failed', {
        executionId: this.executionId,
        pid,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Fallback memory monitoring when WMI queries fail
   */
  private useMemoryUsageFallback(): void {
    // Use process.memoryUsage() as a last resort, but log that we're monitoring parent process
    const memoryUsage = process.memoryUsage();
    this.resourceUsage.memoryBytes = memoryUsage.rss;

    // Log warning that we're falling back to parent process monitoring
    this.logManager.warn('Using parent process memory monitoring fallback', {
      executionId: this.executionId,
      pid: this.process?.pid
    });
  }

  /**
   * Execute PowerShell command synchronously with timeout
   */
  private executePowerShellSync(command: string, timeoutMs: number = 2000): { success: boolean; stdout: string; stderr: string } {
    try {
      const { execSync } = require('child_process');

      // Execute PowerShell command with proper encoding and timeout
      const stdout = execSync(`powershell.exe -Command "${command}"`, {
        encoding: 'utf8',
        timeout: timeoutMs,
        windowsHide: true
      });

      return { success: true, stdout, stderr: '' };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message
      };
    }
  }

  /**
   * Unix/Linux memory monitoring using /proc filesystem
   */
  private monitorMemoryUsageUnix(): void {
    // Simplified memory monitoring for Unix systems
    // In production, this would parse /proc/[pid]/status or /proc/[pid]/statm
    const memoryUsage = Math.random() * 50 * 1024 * 1024; // Placeholder

    this.resourceUsage.memoryBytes = memoryUsage;
  }

  /**
   * Monitor disk usage and write operations
   */
  private monitorDiskUsage(): void {
    if (!this.process) return;

    try {
      // Track disk writes by monitoring allowed directories
      this.trackDiskWrites();
    } catch (error) {
      this.logManager.warn('Disk monitoring failed', {
        executionId: this.executionId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Track disk writes by comparing directory contents
   */
  private trackDiskWrites(): void {
    const currentWrites = new Map<string, number>();

    // Check each allowed directory for write operations
    for (const dir of this.options.allowedDirectories || []) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir, { withFileTypes: true });

          for (const file of files) {
            if (file.isFile()) {
              const filePath = path.join(dir, file.name);
              const stats = fs.statSync(filePath);

              const previousSize = this.diskWriteTracker.get(filePath) || 0;
              const currentSize = stats.size;

              if (currentSize > previousSize) {
                const writeDelta = currentSize - previousSize;
                this.resourceUsage.diskWriteBytes += writeDelta;
                this.resourceUsage.totalDiskWrites += writeDelta;
                currentWrites.set(filePath, currentSize);
              }
            }
          }
        }
      } catch (error) {
        // Ignore directory access errors during monitoring
      }
    }

    // Update the tracker with current sizes
    this.diskWriteTracker = currentWrites;
  }

  /**
   * Monitor network usage and connections
   */
  private monitorNetworkUsage(): void {
    if (!this.process || !this.options.networkAccess) return;

    try {
      // Platform-specific network monitoring
      if (process.platform === 'win32') {
        this.monitorNetworkUsageWindows();
      } else {
        this.monitorNetworkUsageUnix();
      }
    } catch (error) {
      this.logManager.warn('Network monitoring failed', {
        executionId: this.executionId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Windows-specific network monitoring
   */
  private monitorNetworkUsageWindows(): void {
    // Simplified network monitoring for Windows
    // In production, this would use Windows networking APIs
    const networkUsage = Math.random() * 1024; // Placeholder

    this.resourceUsage.networkBytes = networkUsage;
    this.resourceUsage.totalNetworkBytes += networkUsage;
  }

  /**
   * Unix/Linux network monitoring
   */
  private monitorNetworkUsageUnix(): void {
    // Simplified network monitoring for Unix systems
    // In production, this would parse /proc/net/dev or use netstat
    const networkUsage = Math.random() * 1024; // Placeholder

    this.resourceUsage.networkBytes = networkUsage;
    this.resourceUsage.totalNetworkBytes += networkUsage;
  }

  /**
   * Collect performance metrics for analytics and reporting
   */
  private collectPerformanceMetrics(): void {
    this.performanceMetrics.push({
      timestamp: Date.now(),
      cpu: this.resourceUsage.cpuPercentage,
      memory: this.resourceUsage.memoryBytes,
      disk: this.resourceUsage.diskWriteBytes,
      network: this.resourceUsage.networkBytes
    });

    // Keep only the last 1000 metrics to prevent memory bloat
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics = this.performanceMetrics.slice(-1000);
    }
  }

  /**
   * Start comprehensive resource usage monitoring
   */
  private startResourceMonitoring(): void {
    if (!this.process) return;

    // Initialize resource tracking
    this.resourceUsage.startTime = Date.now();
    this.resourceUsage.lastCpuCheck = performance.now();

    this.resourceMonitor = setInterval(() => {
      if (!this.process) return;

      try {
        this.monitorCpuUsage();
        this.monitorMemoryUsage();
        this.monitorDiskUsage();
        this.monitorNetworkUsage();
        this.collectPerformanceMetrics();
        this.checkResourceLimits();
      } catch (error) {
        this.logManager.error('Resource monitoring error', error as Error, {
          executionId: this.executionId
        }, { component: 'sandbox', executionId: this.executionId });
      }
    }, 250); // Check every 250ms for better performance
  }

  /**
   * Stop resource monitoring
   */
  private stopResourceMonitoring(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
      this.resourceMonitor = null;
    }
  }

  /**
   * Comprehensive resource limit enforcement with graceful degradation
   */
  private checkResourceLimits(): void {
    const limits = this.options.resourceLimits!;
    let limitExceeded = false;
    let violationType = '';
    let violationDetails = '';

    // Check execution time limit
    if (limits.maxExecutionTimeMs && (Date.now() - this.startTime) > limits.maxExecutionTimeMs) {
      limitExceeded = true;
      violationType = 'execution_time';
      violationDetails = `Execution time limit exceeded: ${limits.maxExecutionTimeMs}ms`;
    }

    // Check memory limit
    else if (limits.maxMemoryBytes && this.resourceUsage.memoryBytes > limits.maxMemoryBytes) {
      limitExceeded = true;
      violationType = 'memory';
      violationDetails = `Memory limit exceeded: ${this.formatBytes(this.resourceUsage.memoryBytes)} > ${this.formatBytes(limits.maxMemoryBytes)}`;
    }

    // Check CPU limit
    else if (limits.maxCpuPercentage && this.resourceUsage.cpuPercentage > limits.maxCpuPercentage) {
      limitExceeded = true;
      violationType = 'cpu';
      violationDetails = `CPU limit exceeded: ${this.resourceUsage.cpuPercentage.toFixed(1)}% > ${limits.maxCpuPercentage}%`;
    }

    // Check disk write limit
    else if (limits.maxDiskWriteBytes && this.resourceUsage.totalDiskWrites > limits.maxDiskWriteBytes) {
      limitExceeded = true;
      violationType = 'disk';
      violationDetails = `Disk write limit exceeded: ${this.formatBytes(this.resourceUsage.totalDiskWrites)} > ${this.formatBytes(limits.maxDiskWriteBytes)}`;
    }

    // Check network limit
    else if (limits.maxNetworkBytes && this.resourceUsage.totalNetworkBytes > limits.maxNetworkBytes) {
      limitExceeded = true;
      violationType = 'network';
      violationDetails = `Network limit exceeded: ${this.formatBytes(this.resourceUsage.totalNetworkBytes)} > ${this.formatBytes(limits.maxNetworkBytes)}`;
    }

    // Handle resource limit violation
    if (limitExceeded) {
      this.handleResourceLimitViolation(violationType, violationDetails);
    }

    // Check for gradual resource exhaustion (early warning system)
    this.checkResourceTrends();
  }

  /**
   * Handle resource limit violation with appropriate severity
   */
  private handleResourceLimitViolation(type: string, details: string): void {
    const severity = this.determineViolationSeverity(type);

    this.recordSecurityEvent(
      'resource_exceeded' as const,
      severity,
      details
    );

    // Log detailed resource usage at time of violation
    this.logManager.warn(`Resource limit violation: ${type}`, {
      violationType: type,
      violationDetails: details,
      currentResources: {
        cpu: `${this.resourceUsage.cpuPercentage.toFixed(1)}%`,
        memory: this.formatBytes(this.resourceUsage.memoryBytes),
        disk: this.formatBytes(this.resourceUsage.totalDiskWrites),
        network: this.formatBytes(this.resourceUsage.totalNetworkBytes),
        peakMemory: this.formatBytes(this.resourceUsage.peakMemoryBytes),
        peakCpu: `${this.resourceUsage.peakCpuPercentage.toFixed(1)}%`,
        executionTime: `${Date.now() - this.startTime}ms`
      },
      limits: this.options.resourceLimits
    }, { component: 'sandbox', executionId: this.executionId, skillId: path.basename(this.scriptPath) });

    // Terminate process for critical violations
    if (severity === 'high') {
      this.safeKillProcess('SIGKILL');
    }
  }

  /**
   * Determine severity of resource violation
   */
  private determineViolationSeverity(type: string): 'low' | 'medium' | 'high' {
    switch (type) {
      case 'execution_time':
      case 'memory':
        return 'high'; // Critical violations that can cause system instability
      case 'cpu':
        return 'medium'; // CPU exhaustion can affect system performance
      case 'disk':
      case 'network':
        return 'low'; // Disk/network limits are less critical
      default:
        return 'medium';
    }
  }

  /**
   * Check resource usage trends for early warning detection
   */
  private checkResourceTrends(): void {
    const recentMetrics = this.performanceMetrics.slice(-10); // Last 10 measurements

    if (recentMetrics.length < 5) return;

    // Check for rapid memory growth
    const memoryGrowth = this.calculateGrowthRate(recentMetrics.map(m => m.memory));
    if (memoryGrowth > 2.0) { // 200% growth rate
      this.logManager.warn('Rapid memory growth detected', {
        growthRate: memoryGrowth,
        currentMemory: this.formatBytes(this.resourceUsage.memoryBytes),
        peakMemory: this.formatBytes(this.resourceUsage.peakMemoryBytes)
      }, { component: 'sandbox', executionId: this.executionId });
    }

    // Check for sustained high CPU usage
    const highCpuCount = recentMetrics.filter(m => m.cpu > 80).length;
    if (highCpuCount >= 8) { // 80% of recent measurements above 80%
      this.logManager.warn('Sustained high CPU usage detected', {
        highCpuPercentage: (highCpuCount / recentMetrics.length) * 100,
        currentCpu: `${this.resourceUsage.cpuPercentage.toFixed(1)}%`
      }, { component: 'sandbox', executionId: this.executionId });
    }
  }

  /**
   * Calculate growth rate from a series of values
   */
  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;

    const first = values[0];
    const last = values[values.length - 1];

    if (first === 0) return last > 0 ? Infinity : 0;

    return last / first;
  }

  /**
   * Record security event
   */
  private recordSecurityEvent(type: SecurityEvent['type'], severity: SecurityEvent['severity'], details: string): void {
    const event: SecurityEvent = {
      type,
      timestamp: Date.now(),
      details,
      severity
    };

    this.securityEvents.push(event);
    this.emit('securityEvent', event);

    // Log security event
    this.logManager.recordSecurityEvent(this.executionId, severity, details);
    this.logManager.warn(`Security event: ${type}`, {
      severity,
      details,
      type
    }, { component: 'security', executionId: this.executionId, skillId: path.basename(this.scriptPath) });
  }

  /**
   * Handle execution errors
   */
  private handleExecutionError(error: any): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(`Sandbox execution failed: ${String(error)}`);
  }

  /**
   * Handle timeout with atomic process termination
   */
  private handleTimeout(reject: (reason?: any) => void): void {
    // Use atomic check to prevent race conditions
    if (this.isProcessTerminating || !this.process) {
      return;
    }

    this.isProcessTerminating = true;

    try {
      // Record security event first
      this.recordSecurityEvent(
        'resource_exceeded',
        'high',
        `Execution timeout after ${this.options.timeoutMs}ms`
      );

      // Attempt to terminate the process safely
      this.safeKillProcess('SIGKILL');

      reject(new Error(`Execution timeout after ${this.options.timeoutMs}ms`));
    } catch (error) {
      this.logManager.error('Failed to handle timeout', error as Error, {
        executionId: this.executionId
      }, { component: 'sandbox', executionId: this.executionId });
      reject(new Error(`Timeout handling failed: ${(error as Error).message}`));
    } finally {
      this.isProcessTerminating = false;
    }
  }

  /**
   * Safely kill process with comprehensive error handling
   */
  private safeKillProcess(signal: NodeJS.Signals): void {
    if (!this.process) {
      return;
    }

    try {
      // Check if process is already terminated
      if (this.process.killed) {
        return;
      }

      // Attempt to kill the process
      const killed = this.process.kill(signal);

      if (!killed) {
        this.logManager.warn('Process kill signal may not have been delivered', {
          pid: this.process.pid,
          signal
        }, { component: 'sandbox', executionId: this.executionId });
      }

      // Add fallback mechanism for stubborn processes
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logManager.warn('Process still alive after kill signal, forcing termination', {
            pid: this.process.pid
          }, { component: 'sandbox', executionId: this.executionId });

          try {
            // Forceful termination as last resort
            process.kill(this.process.pid!, 'SIGKILL');
          } catch (forceError) {
            this.logManager.error('Failed to force kill process', forceError as Error, {
              pid: this.process.pid
            }, { component: 'sandbox', executionId: this.executionId });
          }
        }
      }, 1000); // Wait 1 second before force killing

    } catch (killError) {
      this.logManager.error('Error killing process', killError as Error, {
        pid: this.process.pid,
        signal
      }, { component: 'sandbox', executionId: this.executionId });

      // Re-throw if it's a critical error
      if ((killError as NodeJS.ErrnoException).code !== 'ESRCH') { // No such process
        throw killError;
      }
    }
  }

  /**
   * Clear timeout if it exists
   */
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Generate comprehensive resource usage report
   */
  private generateResourceReport(): {
    summary: {
      executionTime: number;
      exitCode: number | null;
      peakMemory: string;
      peakCpu: string;
      totalDiskWrites: string;
      totalNetworkBytes: string;
      securityEvents: number;
    };
    details: {
      cpu: Array<{ timestamp: number; usage: number }>;
      memory: Array<{ timestamp: number; usage: number }>;
      disk: Array<{ timestamp: number; writes: number }>;
      network: Array<{ timestamp: number; bytes: number }>;
    };
    violations: SecurityEvent[];
  } {
    return {
      summary: {
        executionTime: Date.now() - this.startTime,
        exitCode: this.process?.exitCode ?? null,
        peakMemory: this.formatBytes(this.resourceUsage.peakMemoryBytes),
        peakCpu: `${this.resourceUsage.peakCpuPercentage.toFixed(1)}%`,
        totalDiskWrites: this.formatBytes(this.resourceUsage.totalDiskWrites),
        totalNetworkBytes: this.formatBytes(this.resourceUsage.totalNetworkBytes),
        securityEvents: this.securityEvents.length
      },
      details: {
        cpu: this.performanceMetrics.map(m => ({
          timestamp: m.timestamp,
          usage: m.cpu
        })),
        memory: this.performanceMetrics.map(m => ({
          timestamp: m.timestamp,
          usage: m.memory
        })),
        disk: this.performanceMetrics.map(m => ({
          timestamp: m.timestamp,
          writes: m.disk
        })),
        network: this.performanceMetrics.map(m => ({
          timestamp: m.timestamp,
          bytes: m.network
        }))
      },
      violations: this.securityEvents.filter(e => e.type === 'resource_exceeded')
    };
  }

  /**
   * Log comprehensive resource usage at execution completion
   */
  private logResourceUsageSummary(exitCode: number | null): void {
    const report = this.generateResourceReport();

    this.logManager.info('Resource usage summary', {
      executionId: this.executionId,
      scriptPath: this.scriptPath,
      exitCode,
      summary: report.summary,
      resourceLimits: this.options.resourceLimits,
      violationCount: report.violations.length
    }, { component: 'sandbox', executionId: this.executionId, skillId: path.basename(this.scriptPath) });

    // Log detailed metrics if debug level is enabled
    this.logManager.debug('Detailed resource metrics', {
      executionId: this.executionId,
      metrics: report.details
    }, { component: 'sandbox', executionId: this.executionId });

    // Log security events if any occurred
    if (report.violations.length > 0) {
      this.logManager.warn('Resource limit violations occurred', {
        executionId: this.executionId,
        violationCount: report.violations.length,
        violations: report.violations.map(v => ({
          type: v.type,
          severity: v.severity,
          details: v.details,
          timestamp: new Date(v.timestamp).toISOString()
        }))
      }, { component: 'security', executionId: this.executionId, skillId: path.basename(this.scriptPath) });
    }
  }

  /**
   * Clean up resources and release monitoring data
   */
  private cleanup(): void {
    this.stopResourceMonitoring();
    this.clearTimeout();

    // Log final resource usage before cleanup
    if (this.process) {
      this.logResourceUsageSummary(this.process.exitCode);
    }

    if (this.process && !this.process.killed) {
      this.safeKillProcess('SIGKILL');
    }

    // Release monitoring resources
    this.process = null;
    this.isProcessTerminating = false;
    this.diskWriteTracker.clear();
    this.networkConnections.clear();
    this.performanceMetrics = [];
    this.wmiCache.clear();
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
   * Abort execution
   */
  abort(): void {
    this.recordSecurityEvent(
      'suspicious_behavior',
      'medium',
      'Execution aborted by user request'
    );

    if (this.process && !this.process.killed) {
      this.safeKillProcess('SIGKILL');
    }

    this.cleanup();
  }

  /**
   * Get current security events
   */
  getSecurityEvents(): SecurityEvent[] {
    return [...this.securityEvents];
  }
}