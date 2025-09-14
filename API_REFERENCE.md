# Windows AI Troubleshooter - API Reference

## Table of Contents
1. [Electron API](#electron-api)
2. [IPC Communication](#ipc-communication)
3. [Skills Engine](#skills-engine)
4. [Resilience System](#resilience-system)
5. [Logging & Monitoring](#logging--monitoring)
6. [Error Handling](#error-handling)
7. [Type Definitions](#type-definitions)

---

## Electron API

### Window Management

#### `getAppVersion()`
Retrieves the application version.

**Returns:** `Promise<string>` - Application version string

**Example:**
```typescript
const version = await window.electronAPI.getAppVersion();
console.log(`App version: ${version}`);
```

#### `minimizeToTray()`
Minimizes the window to system tray.

**Returns:** `Promise<void>`

**Example:**
```typescript
await window.electronAPI.minimizeToTray();
```

#### `restoreFromTray()`
Restores the window from system tray.

**Returns:** `Promise<void>`

**Example:**
```typescript
await window.electronAPI.restoreFromTray();
```

### Tray Management

#### `createTray()`
Creates and configures the system tray icon.

**Parameters:** None
**Returns:** `void`

**Example:**
```typescript
// Called automatically during app initialization
createTray();
```

#### `toggleMainWindow()`
Toggles the main window visibility.

**Parameters:** None
**Returns:** `void`

**Example:**
```typescript
// Toggle window on tray click
tray.on('click', toggleMainWindow);
```

#### `showMainWindow()`
Shows and focuses the main window.

**Parameters:** None
**Returns:** `void`

**Example:**
```typescript
// Show window from context menu
contextMenu.append(new MenuItem({
  label: 'Open',
  click: showMainWindow
}));
```

---

## IPC Communication

### Channels

#### `skill-execution-request`
Request skill execution from renderer to main process.

**Message Type:** `SkillExecutionRequest`

**Structure:**
```typescript
interface SkillExecutionRequest {
  type: 'skill_execution_request';
  messageId: string;
  timestamp: number;
  skillId: string;
  params: Record<string, any>;
  requiresAdmin?: boolean;
  timeoutMs?: number;
}
```

#### `skill-execution-response`
Response from main process to renderer with execution results.

**Message Type:** `SkillExecutionResponse`

**Structure:**
```typescript
interface SkillExecutionResponse {
  type: 'skill_execution_response';
  messageId: string;
  timestamp: number;
  correlationId: string;
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
```

#### `heartbeat`
Heartbeat message from main process to monitor connection health.

**Message Type:** `HeartbeatMessage`

**Structure:**
```typescript
interface HeartbeatMessage {
  type: 'heartbeat';
  messageId: string;
  timestamp: number;
  sequence: number;
}
```

#### `heartbeat-ack`
Heartbeat acknowledgment from renderer to main process.

**Message Type:** `HeartbeatAckMessage`

**Structure:**
```typescript
interface HeartbeatAckMessage {
  type: 'heartbeat_ack';
  messageId: string;
  timestamp: number;
  correlationId: string;
  sequence: number;
  latencyMs: number;
}
```

#### `connection-state`
Connection state updates between processes.

**Message Type:** `ConnectionStateMessage`

**Structure:**
```typescript
interface ConnectionStateMessage {
  type: 'connection_state';
  messageId: string;
  timestamp: number;
  state: 'connected' | 'disconnected' | 'reconnecting';
  reason?: string;
}
```

### IPC Configuration

#### `IPC_CONFIG`
Default configuration constants for IPC communication.

**Location:** `src/types/ipc.ts`

**Values:**
```typescript
export const IPC_CONFIG = {
  DEFAULT_TIMEOUT_MS: 30000,       // 30 seconds
  HEARTBEAT_INTERVAL_MS: 5000,     // 5 seconds
  MAX_RETRY_ATTEMPTS: 3,           // Maximum retry attempts
  CONNECTION_TIMEOUT_MS: 10000,    // 10 second connection timeout
} as const;
```

### IPC Utilities

#### `executeSkill()`
Execute a skill from the renderer process.

**Parameters:**
- `skillId: string` - ID of the skill to execute
- `params: Record<string, any> = {}` - Skill parameters
- `options: { timeoutMs?: number; requiresAdmin?: boolean } = {}` - Execution options

**Returns:** `Promise<SkillExecutionResponse>`

**Example:**
```typescript
import { executeSkill } from '../ipc/rendererUtilities';

const response = await executeSkill('wifi-reset', {}, {
  timeoutMs: 15000,
  requiresAdmin: true
});

if (response.status === 'success') {
  console.log('Success:', response.output);
} else {
  console.error('Error:', response.error?.message);
}
```

#### `initializeConnection()`
Initialize IPC connection from renderer process.

**Returns:** `Promise<void>`

**Example:**
```typescript
import { initializeConnection } from '../ipc/rendererUtilities';

await initializeConnection();
console.log('IPC connection established');
```

#### `addConnectionStateListener()`
Add listener for connection state changes.

**Parameters:**
- `listener: (message: ConnectionStateMessage) => void` - Callback function

**Returns:** `() => void` - Function to remove listener

**Example:**
```typescript
import { addConnectionStateListener } from '../ipc/rendererUtilities';

const removeListener = addConnectionStateListener((message) => {
  console.log('Connection state:', message.state);
  if (message.state === 'disconnected') {
    // Handle reconnection
  }
});

// Clean up when done
// removeListener();
```

#### `registerSkill()`
Register a skill handler in the main process.

**Parameters:**
- `skillId: string` - Unique skill identifier
- `handler: (params: Record<string, any>) => Promise<string>` - Skill execution function

**Returns:** `void`

**Example:**
```typescript
import { registerSkill } from '../ipc/mainHandlers';

registerSkill('system-info', async () => {
  return JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    uptime: process.uptime()
  }, null, 2);
});
```

#### `initializeIPCHandlers()`
Initialize all IPC handlers in the main process.

**Parameters:** None
**Returns:** `void`

**Example:**
```typescript
import { initializeIPCHandlers } from '../ipc/mainHandlers';

app.whenReady().then(() => {
  initializeIPCHandlers();
  // Register skills and start application
});
```

---

## Skills Engine

### Sandbox Classes

#### `SkillSandbox`
Generic sandbox for executing scripts securely.

**Location:** `src/skills-engine/sandbox.ts`

**Constructor:**
```typescript
constructor(
  scriptPath: string,
  scriptType: ScriptType,
  options?: SandboxOptions
)
```

**Methods:**
- `execute(args?: string[]): Promise<SandboxResult>` - Execute script
- `terminate(): void` - Force terminate execution
- `getResourceUsage(): ResourceUsage` - Get current resource usage

**Example:**
```typescript
import { SkillSandbox } from '../skills-engine/sandbox';

const sandbox = new SkillSandbox('/path/to/script.ps1', 'powershell', {
  resourceLimits: {
    maxMemoryBytes: 50 * 1024 * 1024, // 50MB
    maxExecutionTimeMs: 15000         // 15 seconds
  }
});

const result = await sandbox.execute(['--param', 'value']);
console.log('Exit code:', result.exitCode);
console.log('Output:', result.stdout);
```

#### `PowerShellSandbox`
PowerShell-specific sandbox with enhanced security.

**Location:** `src/skills-engine/powershell-sandbox.ts`

**Constructor:**
```typescript
constructor(
  scriptPath: string,
  options?: PowerShellSandboxOptions
)
```

**Options:**
```typescript
interface PowerShellSandboxOptions {
  executionPolicy?: 'Restricted' | 'AllSigned' | 'RemoteSigned' | 'Unrestricted' | 'Bypass';
  noProfile?: boolean;
  noLogo?: boolean;
  restrictedLanguageMode?: boolean;
  constraintMode?: boolean;
  encodedCommand?: boolean;
  resourceLimits?: ResourceLimits;
}
```

**Example:**
```typescript
import { PowerShellSandbox } from '../skills-engine/powershell-sandbox';

const sandbox = new PowerShellSandbox('/skills/wifi-reset.ps1', {
  executionPolicy: 'Restricted',
  noProfile: true,
  restrictedLanguageMode: true,
  resourceLimits: {
    maxExecutionTimeMs: 10000
  }
});

const result = await sandbox.execute();
```

### Resource Limits

#### `ResourceLimits`
Configuration for sandbox resource constraints.

**Location:** `src/skills-engine/types.ts`

**Structure:**
```typescript
interface ResourceLimits {
  maxCpuPercentage?: number;      // Default: 50%
  maxMemoryBytes?: number;        // Default: 100MB
  maxExecutionTimeMs?: number;    // Default: 30 seconds
  maxDiskWriteBytes?: number;     // Default: 10MB
  maxNetworkBytes?: number;       // Default: 1MB
  maxConcurrentProcesses?: number; // Default: 1
  maxOpenFiles?: number;          // Default: 10
  maxChildProcesses?: number;     // Default: 0
}
```

### Sandbox Options

#### `SandboxOptions`
Configuration for sandbox execution environment.

**Location:** `src/skills-engine/types.ts`

**Structure:**
```typescript
interface SandboxOptions {
  resourceLimits?: ResourceLimits;
  allowedDirectories?: string[];    // Whitelisted directories
  networkAccess?: boolean;          // Default: false
  environmentVariables?: Record<string, string>; // Custom environment
  workingDirectory?: string;        // Execution working directory
  timeoutMs?: number;               // Overall timeout
  enableStrictMode?: boolean;       // Enhanced security
  allowSystemCalls?: boolean;       // Allow system calls
  maxRetryAttempts?: number;        // Retry attempts on failure
}
```

---

## Resilience System

### Resilience Manager

#### `createResilienceManager()`
Create a resilience manager instance.

**Parameters:**
- `errorHandler: ErrorHandler` - Custom error handler

**Returns:** `ResilienceManager`

**Example:**
```typescript
import { createResilienceManager } from '../skills-engine/resilience-manager';

const resilienceManager = createResilienceManager({
  handleError: (error, context) => {
    console.error('Resilience error:', error, context);
  }
});
```

#### `executeWithResilience()`
Execute an operation with resilience patterns.

**Parameters:**
- `operation: () => Promise<T>` - Operation to execute
- `options: ResilienceOptions` - Resilience configuration

**Returns:** `Promise<T>`

**Options:**
```typescript
interface ResilienceOptions {
  operationName: string;
  circuitName?: string;
  timeoutLevel?: 'global' | 'execution' | 'resource' | 'cleanup';
  retryStrategy?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    jitter?: boolean;
  };
  fallbackStrategy?: {
    strategy: 'defaultValue' | 'alternativeOperation' | 'degradedService';
    defaultValue?: any;
    alternativeOperation?: () => Promise<any>;
  };
}
```

**Example:**
```typescript
const result = await resilienceManager.executeWithResilience(
  async () => {
    return await executeSkill('critical-operation');
  },
  {
    operationName: 'critical-operation',
    circuitName: 'critical-circuit',
    timeoutLevel: 'execution',
    retryStrategy: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffFactor: 2,
      jitter: true
    },
    fallbackStrategy: {
      strategy: 'defaultValue',
      defaultValue: 'fallback-result'
    }
  }
);
```

### Circuit Breaker

#### `CircuitBreaker`
Circuit breaker pattern implementation.

**Location:** `src/skills-engine/circuit-breaker.ts`

**Methods:**
- `execute(operation: () => Promise<T>): Promise<T>` - Execute with circuit breaker
- `getState(): CircuitState` - Get current circuit state
- `reset(): void` - Reset circuit breaker

**States:**
- `CLOSED`: Normal operation
- `OPEN`: Circuit open, failing fast
- `HALF_OPEN`: Testing if service recovered

**Example:**
```typescript
import { CircuitBreaker } from '../skills-engine/circuit-breaker';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,     // Open after 5 failures
  successThreshold: 3,     // Close after 3 successes
  timeoutMs: 30000,        // Time in open state
  resetTimeoutMs: 60000    // Time before attempting reset
});

const result = await circuitBreaker.execute(async () => {
  return await externalServiceCall();
});
```

### Retry Manager

#### `RetryManager`
Retry pattern with exponential backoff.

**Location:** `src/skills-engine/retry-manager.ts`

**Methods:**
- `execute(operation: () => Promise<T>): Promise<T>` - Execute with retries
- `withRetry(operation: () => Promise<T>, options?: RetryOptions): Promise<T>` - Static method

**Options:**
```typescript
interface RetryOptions {
  maxAttempts?: number;        // Default: 3
  initialDelayMs?: number;     // Default: 1000
  backoffFactor?: number;      // Default: 2
  jitter?: boolean;            // Default: true
  shouldRetry?: (error: Error) => boolean; // Custom retry logic
}
```

**Example:**
```typescript
import { RetryManager } from '../skills-engine/retry-manager';

const result = await RetryManager.withRetry(
  async () => {
    return await unreliableOperation();
  },
  {
    maxAttempts: 5,
    initialDelayMs: 500,
    backoffFactor: 1.5,
    jitter: true,
    shouldRetry: (error) => error.message.includes('retryable')
  }
);
```

### Timeout Manager

#### `TimeoutManager`
Timeout pattern implementation.

**Location:** `src/skills-engine/timeout-manager.ts`

**Methods:**
- `execute(operation: () => Promise<T>, timeoutMs: number): Promise<T>` - Execute with timeout
- `withTimeout(operation: () => Promise<T>, timeoutMs: number): Promise<T>` - Static method

**Example:**
```typescript
import { TimeoutManager } from '../skills-engine/timeout-manager';

const result = await TimeoutManager.withTimeout(
  async () => {
    return await slowOperation();
  },
  5000 // 5 second timeout
);
```

---

## Logging & Monitoring

### Log Manager

#### `getLogManager()`
Get the global log manager instance.

**Returns:** `LogManager`

**Methods:**
- `info(message: string, context?: any): void` - Info level log
- `warn(message: string, context?: any): void` - Warning level log
- `error(message: string, error?: Error, context?: any): void` - Error level log
- `debug(message: string, context?: any): void` - Debug level log
- `audit(event: string, details: any): void` - Audit log
- `getPerformanceReport(): PerformanceReport` - Get performance metrics
- `healthCheck(): Promise<HealthStatus>` - Health check

**Example:**
```typescript
import { getLogManager } from '../skills-engine/logging';

const logManager = getLogManager();

logManager.info('Skill execution started', { skillId: 'wifi-reset' });
logManager.error('Execution failed', error, { skillId: 'wifi-reset' });

const metrics = logManager.getPerformanceReport();
console.log('Success rate:', metrics.successRate);
```

### Monitoring System

#### `MonitoringSystem`
Real-time performance monitoring.

**Location:** `src/skills-engine/logging/MonitoringSystem.ts`

**Methods:**
- `start(): void` - Start monitoring
- `stop(): void` - Stop monitoring
- `getMetrics(): MonitoringMetrics` - Get current metrics
- `addAlert(condition: AlertCondition, handler: AlertHandler): string` - Add alert
- `removeAlert(alertId: string): void` - Remove alert

**Example:**
```typescript
import { getMonitoringSystem } from '../skills-engine/logging';

const monitoring = getMonitoringSystem();
monitoring.start();

// Add memory usage alert
const alertId = monitoring.addAlert(
  {
    metric: 'memoryUsage',
    threshold: 0.8, // 80%
    duration: 30000 // 30 seconds
  },
  (alert) => {
    console.warn('High memory usage:', alert.value);
  }
);

// Get current metrics
const metrics = monitoring.getMetrics();
console.log('CPU usage:', metrics.cpuUsage);
```

### Security Audit Logger

#### `SecurityAuditLogger`
Security event auditing.

**Location:** `src/skills-engine/logging/SecurityAuditLogger.ts`

**Methods:**
- `logSecurityEvent(event: SecurityEvent): void` - Log security event
- `getSecurityEvents(filter?: SecurityEventFilter): SecurityEvent[]` - Get security events
- `exportEvents(format: 'json' | 'csv'): string` - Export events

**Example:**
```typescript
import { getSecurityAuditLogger } from '../skills-engine/logging';

const auditLogger = getSecurityAuditLogger();

auditLogger.logSecurityEvent({
  type: 'resource_exceeded',
  timestamp: Date.now(),
  details: 'Memory limit exceeded',
  severity: 'high'
});

const events = auditLogger.getSecurityEvents({
  severity: 'high',
  startTime: Date.now() - 3600000 // Last hour
});
```

---

## Error Handling

### Error Classes

#### `IPCError`
Structured error class for IPC communication.

**Location:** `src/ipc/errorHandling.ts`

**Static Methods:**
- `IPCError.timeout(message: string): IPCError` - Create timeout error
- `IPCError.connectionLost(message: string): IPCError` - Create connection error
- `IPCError.invalidMessage(message: string): IPCError` - Create invalid message error
- `IPCError.skillNotFound(skillId: string): IPCError` - Create skill not found error

**Properties:**
- `code: string` - Error code
- `message: string` - Error message
- `details?: any` - Additional details
- `isRetryable(): boolean` - Check if error is retryable

**Example:**
```typescript
import { IPCError } from '../ipc/errorHandling';

// Create error
const error = IPCError.timeout('Request timed out');
console.log(error.code); // 'TIMEOUT'
console.log(error.isRetryable()); // true

// Throw error
throw IPCError.skillNotFound('unknown-skill');
```

#### `EnvironmentVariableError`
Error for environment variable validation issues.

**Location:** `src/skills-engine/sandbox.ts`

**Properties:**
- `message: string` - Error message
- `variableName?: string` - Name of problematic variable

**Example:**
```typescript
import { EnvironmentVariableError } from '../skills-engine/sandbox';

throw new EnvironmentVariableError('Invalid variable name', 'BAD_VAR');
```

### Error Handler

#### `ErrorHandler`
Centralized error handling system.

**Location:** `src/skills-engine/error-handler.ts`

**Methods:**
- `handleError(error: Error, context?: any): void` - Handle error
- `registerHook(hook: ErrorHook): void` - Register error hook
- `unregisterHook(hookId: string): void` - Unregister error hook

**Example:**
```typescript
import { getErrorHandler } from '../skills-engine/error-handler';

const errorHandler = getErrorHandler();

errorHandler.registerHook({
  id: 'log-errors',
  handleError: (error, context) => {
    console.error('Error occurred:', error, context);
  }
});

try {
  await riskyOperation();
} catch (error) {
  errorHandler.handleError(error, { operation: 'risky' });
}
```

---

## Type Definitions

### Core Types

#### `ScriptType`
Supported script types for execution.

**Location:** `src/skills-engine/types.ts`

**Values:**
```typescript
type ScriptType = 'powershell' | 'shell' | 'batch' | 'python';
```

#### `SecurityEvent`
Security event structure.

**Location:** `src/skills-engine/types.ts`

**Structure:**
```typescript
interface SecurityEvent {
  type: 'filesystem_access' | 'network_access' | 'resource_exceeded' | 'suspicious_behavior';
  timestamp: number;
  details: string;
  severity: 'low' | 'medium' | 'high';
}
```

#### `SandboxResult`
Sandbox execution result.

**Location:** `src/skills-engine/types.ts`

**Structure:**
```typescript
interface SandboxResult {
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
```

### IPC Types

#### `IPCMessageBase`
Base structure for all IPC messages.

**Location:** `src/types/ipc.ts`

**Structure:**
```typescript
interface IPCMessageBase {
  type: string;
  messageId: string;
  timestamp: number;
  correlationId?: string;
}
```

#### `IPC_ERROR_CODES`
Standard error codes for IPC communication.

**Location:** `src/types/ipc.ts`

**Values:**
```typescript
export const IPC_ERROR_CODES = {
  TIMEOUT: 'TIMEOUT',
  CONNECTION_LOST: 'CONNECTION_LOST',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_EXECUTION_FAILED: 'SKILL_EXECUTION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED'
} as const;
```

### Resilience Types

#### `CircuitState`
Circuit breaker states.

**Location:** `src/skills-engine/circuit-breaker.ts`

**Values:**
```typescript
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

#### `FallbackStrategy`
Fallback strategy types.

**Location:** `src/skills-engine/resilience-manager.ts`

**Values:**
```typescript
type FallbackStrategy = {
  strategy: 'defaultValue' | 'alternativeOperation' | 'degradedService';
  defaultValue?: any;
  alternativeOperation?: () => Promise<any>;
};
```

---

## Version Information

### API Versioning
- **Current Version:** 1.0.0
- **Backward Compatibility:** Maintained for IPC protocols
- **Breaking Changes:** Documented in release notes

### Deprecation Policy
- APIs are deprecated for one major version before removal
- Deprecated APIs generate warnings in development mode
- Migration guides provided for breaking changes

### Changelog
- See `CHANGELOG.md` for detailed version history
- API changes documented with each release
- Security updates highlighted separately

---

## Additional Resources

### Documentation
- [Full TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Electron API Reference](https://www.electronjs.org/docs)
- [React API Reference](https://reactjs.org/docs)

### Examples
- See `src/ipc/usageExamples.ts` for comprehensive examples
- Check `src/skills-engine/resilience-examples.ts` for resilience patterns
- Review `src/skills-engine/logging/examples/` for logging examples

### Support
- [GitHub Issues](https://github.com/your-repo/issues)
- [API Documentation Updates](https://github.com/your-repo/docs)
- [Community Discord](https://discord.gg/your-community)

---

*This API reference is generated from source code and may be updated frequently. Always check the latest version in the repository.*