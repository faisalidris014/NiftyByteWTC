// Core sandbox components
export { SkillSandbox, SandboxOptions, SandboxResult, SecurityEvent, ScriptType } from './sandbox';
export { PowerShellSandbox, PowerShellSandboxOptions } from './powershell-sandbox';

// Security guards and monitors
export { FilesystemGuard, FilesystemGuardOptions, FilesystemAccessEvent } from './filesystem-guard';
export { NetworkGuard, NetworkGuardOptions, NetworkAccessEvent } from './network-guard';
export { BehaviorMonitor, BehaviorMonitorOptions, BehaviorEvent, ProcessSpawnInfo } from './behavior-monitor';

// Resource management
export { ResourceManager, ResourceInfo, CleanupOptions, ResourceUsage } from './resource-manager';

// Error handling
export { ErrorHandler, ErrorHandlerOptions, ErrorEvent, ErrorContext, ErrorSeverity, ERROR_CODES } from './error-handler';

// Timeout and error resilience system
export { TimeoutManager, TimeoutManagerOptions, TimeoutEvent, createTimeoutManager } from './timeout-manager';
export { CircuitBreaker, CircuitBreakerManager, CircuitBreakerOptions, CircuitBreakerEvent, CircuitState, createCircuitBreakerManager } from './circuit-breaker';
export { RetryManager, RetryStrategy, RetryEvent, createRetryManager } from './retry-manager';
export { FallbackManager, FallbackOptions, FallbackEvent, FallbackStrategy, createFallbackManager } from './fallback-manager';
export { ErrorReporter, ErrorReporterOptions, ErrorReport, createErrorReporter } from './error-reporter';
export { ResourceCleaner, ResourceCleanerOptions, CleanupEvent, ResourceType, createResourceCleaner } from './resource-cleaner';
export { ErrorHooks, ErrorHooksOptions, HookEvent, HookType, HookPriority, createErrorHooks } from './error-hooks';
export { ResilienceManager, ResilienceManagerOptions, ExecutionContext, createResilienceManager } from './resilience-manager';

// IPC communication
export { IPCBridge, IPCBridgeOptions, IPCMessage, IPCConnectionState } from './ipc-bridge';

// Utility functions and types
export * from './types';

// Logging and monitoring system
export * from './logging';

// Default configurations
export const DEFAULT_SANDBOX_OPTIONS: SandboxOptions = {
  resourceLimits: {
    maxCpuPercentage: 50,
    maxMemoryBytes: 100 * 1024 * 1024, // 100MB
    maxExecutionTimeMs: 30000, // 30 seconds
    maxDiskWriteBytes: 10 * 1024 * 1024, // 10MB
    maxNetworkBytes: 1024 * 1024 // 1MB
  },
  allowedDirectories: [],
  networkAccess: false,
  environmentVariables: {},
  workingDirectory: process.cwd(),
  timeoutMs: 30000
};

export const DEFAULT_POWERSHELL_OPTIONS: PowerShellSandboxOptions = {
  executionPolicy: 'Restricted',
  noProfile: true,
  noLogo: true,
  inputFormat: 'Text',
  outputFormat: 'Text',
  encodedCommand: false,
  restrictedLanguageMode: true,
  constraintMode: true
};

export const DEFAULT_FILESYSTEM_GUARD_OPTIONS: FilesystemGuardOptions = {
  allowedDirectories: [],
  readOnly: true,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  blockedExtensions: [
    '.exe', '.dll', '.bat', '.cmd', '.ps1', '.sh',
    '.js', '.vbs', '.com', '.scr', '.pif', '.msi',
    '.msp', '.mst', '.reg', '.inf', '.sys', '.drv'
  ],
  blockedPatterns: [
    /\$Recycle\.Bin/i,
    /System32/i,
    /Windows/i,
    /Program Files/i,
    /ProgramData/i,
    /AppData/i,
    /Temp/i,
    /Temporary Internet Files/i,
    /\/etc\//i,
    /\/usr\//i,
    /\/var\//i,
    /\/lib\//i,
    /\/bin\//i,
    /\/sbin\//i
  ]
};

export const DEFAULT_NETWORK_GUARD_OPTIONS: NetworkGuardOptions = {
  enabled: true,
  allowedHosts: ['localhost', '127.0.0.1', '::1'],
  blockedHosts: [],
  allowedPorts: [],
  blockedPorts: [],
  maxConnections: 5,
  maxBandwidthBytes: 1024 * 1024, // 1MB
  dnsResolution: false
};

export const DEFAULT_BEHAVIOR_MONITOR_OPTIONS: BehaviorMonitorOptions = {
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
  fileOperationThresholdMs: 100
};

export const DEFAULT_ERROR_HANDLER_OPTIONS: ErrorHandlerOptions = {
  maxErrors: 1000,
  errorExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  retryAttempts: 3,
  retryDelayMs: 1000,
  logToConsole: true,
  enableReporting: true,
  severityThreshold: 'warning'
};

export const DEFAULT_IPC_BRIDGE_OPTIONS: IPCBridgeOptions = {
  secretKey: '', // Will be generated automatically
  maxMessageSize: 1024 * 1024, // 1MB
  timeoutMs: 30000, // 30 seconds
  maxRetries: 3,
  enableEncryption: true,
  enableSigning: true
};

// Default timeout configuration
export const DEFAULT_TIMEOUT_OPTIONS: TimeoutManagerOptions = {
  defaultTimeouts: {
    global: 60000, // 60 seconds
    execution: 30000, // 30 seconds
    resource: 10000, // 10 seconds
    cleanup: 5000, // 5 seconds
  },
  enableGracefulShutdown: true,
  gracePeriodMs: 2000,
  maxNestedTimeouts: 10,
};

// Default circuit breaker configuration
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30000, // 30 seconds
  resetTimeoutMs: 60000, // 60 seconds
  maxFailures: 100,
};

// Default retry strategy
export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
};

// Default fallback options
export const DEFAULT_FALLBACK_OPTIONS: FallbackOptions = {
  strategy: 'defaultValue',
};

// Default error reporter configuration
export const DEFAULT_REPORTER_OPTIONS: ErrorReporterOptions = {
  enabled: true,
  maxReports: 1000,
  reportExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  includeEnvironment: true,
  includeSystemInfo: true,
  includeDiagnostics: true,
  minSeverity: 'error',
  exportFormats: ['json', 'text'],
};

// Default resource cleaner configuration
export const DEFAULT_CLEANER_OPTIONS: ResourceCleanerOptions = {
  autoCleanup: true,
  cleanupIntervalMs: 30000, // 30 seconds
  maxResources: 1000,
  resourceExpiryMs: 3600000, // 1 hour
  enableMonitoring: true,
};

// Default error hooks configuration
export const DEFAULT_HOOKS_OPTIONS: ErrorHooksOptions = {
  maxHooks: 100,
  hookTimeoutMs: 5000, // 5 seconds
  enableHookChaining: true,
  stopOnFirstFailure: false,
};

// Default resilience manager configuration
export const DEFAULT_RESILIENCE_OPTIONS: ResilienceManagerOptions = {
  enabled: true,
  enableMonitoring: true,
  enableReporting: true,
  enableCleanup: true,
  enableHooks: true,
  timeoutOptions: DEFAULT_TIMEOUT_OPTIONS,
  circuitBreakerOptions: DEFAULT_CIRCUIT_BREAKER_OPTIONS,
  retryOptions: DEFAULT_RETRY_STRATEGY,
  fallbackOptions: DEFAULT_FALLBACK_OPTIONS,
  reporterOptions: DEFAULT_REPORTER_OPTIONS,
  cleanerOptions: DEFAULT_CLEANER_OPTIONS,
  hooksOptions: DEFAULT_HOOKS_OPTIONS,
};

/**
 * Create a complete sandbox environment with all security features
 */
export function createSecureSandbox(scriptPath: string, scriptType: ScriptType, options?: Partial<SandboxOptions>) {
  const sandbox = new SkillSandbox(scriptPath, scriptType, {
    ...DEFAULT_SANDBOX_OPTIONS,
    ...options
  });

  // Add security event listeners
  sandbox.on('securityEvent', (event: SecurityEvent) => {
    console.warn(`Security event: ${event.type} - ${event.details} (${event.severity})`);
  });

  return sandbox;
}

/**
 * Create a comprehensive error handler with default configuration
 */
export function createErrorHandler(options?: Partial<ErrorHandlerOptions>) {
  return new ErrorHandler({
    ...DEFAULT_ERROR_HANDLER_OPTIONS,
    ...options
  });
}

/**
 * Create a resource manager for cleanup operations
 */
export function createResourceManager(options?: Partial<CleanupOptions>) {
  return new ResourceManager({
    removeTempFiles: true,
    closeNetworkConnections: true,
    terminateProcesses: true,
    freeMemory: true,
    timeoutMs: 5000,
    ...options
  });
}

/**
 * Create a comprehensive resilience manager with default configuration
 */
export function createResilienceManagerWithDefaults(errorHandler: ErrorHandler): ResilienceManager {
  return new ResilienceManager(errorHandler, DEFAULT_RESILIENCE_OPTIONS);
}

/**
 * Create a timeout manager with default configuration
 */
export function createDefaultTimeoutManager(): TimeoutManager {
  return new TimeoutManager(DEFAULT_TIMEOUT_OPTIONS);
}

/**
 * Create a circuit breaker manager with default configuration
 */
export function createDefaultCircuitBreakerManager(): CircuitBreakerManager {
  return new CircuitBreakerManager();
}

/**
 * Create a retry manager with default configuration
 */
export function createDefaultRetryManager(errorHandler?: ErrorHandler): RetryManager {
  return new RetryManager(errorHandler, DEFAULT_RETRY_STRATEGY);
}

/**
 * Create a fallback manager with default configuration
 */
export function createDefaultFallbackManager(errorHandler?: ErrorHandler): FallbackManager {
  return new FallbackManager(errorHandler, DEFAULT_FALLBACK_OPTIONS);
}

/**
 * Create an error reporter with default configuration
 */
export function createDefaultErrorReporter(errorHandler: ErrorHandler): ErrorReporter {
  return new ErrorReporter(errorHandler, DEFAULT_REPORTER_OPTIONS);
}

/**
 * Create a resource cleaner with default configuration
 */
export function createDefaultResourceCleaner(): ResourceCleaner {
  return new ResourceCleaner(DEFAULT_CLEANER_OPTIONS);
}

/**
 * Create an error hooks manager with default configuration
 */
export function createDefaultErrorHooks(): ErrorHooks {
  return new ErrorHooks(DEFAULT_HOOKS_OPTIONS);
}