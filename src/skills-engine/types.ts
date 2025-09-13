// Common types for the skills engine

export interface ResourceUsage {
  cpuPercentage: number;
  memoryBytes: number;
  diskWriteBytes: number;
  networkBytes: number;
}

export interface SecurityEvent {
  type: 'filesystem_access' | 'network_access' | 'resource_exceeded' | 'suspicious_behavior';
  timestamp: number;
  details: string;
  severity: 'low' | 'medium' | 'high';
}

export type ScriptType = 'powershell' | 'shell' | 'batch' | 'python';

// Skill metadata from JSON files
export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  os: string[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresAdmin: boolean;
  script: string;
  version: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: any;
    description?: string;
  }>;
  output: {
    success: string;
    failure: string;
  };
}

// Skill execution request
export interface SkillExecutionRequest {
  skillId: string;
  parameters: Record<string, any>;
  timeoutMs?: number;
  requiresAdmin?: boolean;
}

// Skill execution result
export interface SkillExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
  resourceUsage: ResourceUsage;
  securityEvents: SecurityEvent[];
}

// Sandbox configuration
export interface SandboxConfig {
  maxCpuPercentage: number;
  maxMemoryBytes: number;
  maxExecutionTimeMs: number;
  maxDiskWriteBytes: number;
  maxNetworkBytes: number;
  allowedDirectories: string[];
  networkAccess: boolean;
  environmentVariables: Record<string, string>;
}

// Monitoring statistics
export interface MonitoringStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs: number;
  totalSecurityEvents: number;
  highSeverityEvents: number;
  resourceUsage: {
    maxCpu: number;
    maxMemory: number;
    maxDisk: number;
    maxNetwork: number;
  };
}

// Health check result
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  timestamp: number;
  component: string;
}

// Performance metrics
export interface PerformanceMetrics {
  executionTimeMs: number;
  memoryUsageBytes: number;
  cpuUsagePercentage: number;
  diskOperations: number;
  networkOperations: number;
  securityCheckTimeMs: number;
}

// Audit log entry
export interface AuditLogEntry {
  timestamp: number;
  userId: string;
  skillId: string;
  action: 'execute' | 'approve' | 'reject' | 'modify';
  result: 'success' | 'failure' | 'pending';
  details: string;
  ipAddress?: string;
  userAgent?: string;
}

// Rate limiting configuration
export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxConcurrentExecutions: number;
  burstCapacity: number;
  refillRate: number;
}

// Cache configuration
export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

// Export all types
export * from './sandbox';
export * from './powershell-sandbox';
export * from './filesystem-guard';
export * from './network-guard';
export * from './behavior-monitor';
export * from './resource-manager';
export * from './error-handler';
export * from './ipc-bridge';