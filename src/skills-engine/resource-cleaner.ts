import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorHandler, ErrorContext } from './error-handler';

// Resource types
export type ResourceType = 'file' | 'directory' | 'process' | 'network' | 'memory' | 'timer' | 'event' | 'custom';

// Resource tracking information
interface ResourceInfo {
  id: string;
  type: ResourceType;
  description: string;
  createdAt: number;
  size?: number;
  path?: string;
  processId?: number;
  cleanupPriority: number; // 1-10, 1 = highest priority
  cleanupHandler: () => Promise<void>;
  metadata?: Record<string, any>;
}

// Cleanup event
export interface CleanupEvent {
  resourceId: string;
  resourceType: ResourceType;
  success: boolean;
  error?: Error;
  timestamp: number;
  cleanupTimeMs: number;
}

// Cleanup configuration
export interface ResourceCleanerOptions {
  autoCleanup: boolean;
  cleanupIntervalMs: number;
  maxResources: number;
  resourceExpiryMs: number;
  enableMonitoring: boolean;
  errorHandler?: ErrorHandler;
}

// Default cleanup configuration
const DEFAULT_CLEANUP_OPTIONS: ResourceCleanerOptions = {
  autoCleanup: true,
  cleanupIntervalMs: 30000, // 30 seconds
  maxResources: 1000,
  resourceExpiryMs: 3600000, // 1 hour
  enableMonitoring: true,
};

/**
 * Comprehensive resource leak prevention and cleanup system
 */
export class ResourceCleaner extends EventEmitter {
  private resources: Map<string, ResourceInfo> = new Map();
  private cleanupHistory: CleanupEvent[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private options: ResourceCleanerOptions;

  constructor(options: Partial<ResourceCleanerOptions> = {}) {
    super();
    this.options = { ...DEFAULT_CLEANUP_OPTIONS, ...options };
    this.startCleanupMonitoring();
  }

  /**
   * Start cleanup monitoring
   */
  private startCleanupMonitoring(): void {
    if (this.options.autoCleanup && this.options.cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredResources();
      }, this.options.cleanupIntervalMs);
    }
  }

  /**
   * Stop cleanup monitoring
   */
  private stopCleanupMonitoring(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Track a resource for cleanup
   */
  trackResource(
    type: ResourceType,
    description: string,
    cleanupHandler: () => Promise<void>,
    metadata?: Record<string, any>,
    cleanupPriority: number = 5
  ): string {
    const resourceId = this.generateResourceId(type);

    const resourceInfo: ResourceInfo = {
      id: resourceId,
      type,
      description,
      createdAt: Date.now(),
      cleanupPriority,
      cleanupHandler,
      metadata,
    };

    this.resources.set(resourceId, resourceInfo);

    // Check if we need to cleanup due to max resources
    if (this.resources.size > this.options.maxResources) {
      this.cleanupOldestResources();
    }

    this.emit('resourceTracked', {
      resourceId,
      type,
      description,
      timestamp: Date.now(),
    });

    return resourceId;
  }

  /**
   * Track a file resource
   */
  trackFile(
    filePath: string,
    description: string = 'Temporary file',
    cleanupPriority: number = 3
  ): string {
    return this.trackResource(
      'file',
      description,
      async () => {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      },
      { path: filePath },
      cleanupPriority
    );
  }

  /**
   * Track a directory resource
   */
  trackDirectory(
    dirPath: string,
    description: string = 'Temporary directory',
    cleanupPriority: number = 2
  ): string {
    return this.trackResource(
      'directory',
      description,
      async () => {
        if (fs.existsSync(dirPath)) {
          await fs.promises.rm(dirPath, { recursive: true, force: true });
        }
      },
      { path: dirPath },
      cleanupPriority
    );
  }

  /**
   * Track a process resource
   */
  trackProcess(
    processId: number,
    description: string = 'Child process',
    cleanupPriority: number = 1
  ): string {
    return this.trackResource(
      'process',
      description,
      async () => {
        try {
          process.kill(processId, 'SIGTERM');
          // Give process time to terminate gracefully
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.kill(processId, 'SIGKILL');
        } catch (error) {
          // Process might already be terminated
          if ((error as any).code !== 'ESRCH') {
            throw error;
          }
        }
      },
      { processId },
      cleanupPriority
    );
  }

  /**
   * Track a timer resource
   */
  trackTimer(
    timer: NodeJS.Timeout,
    description: string = 'Timeout timer',
    cleanupPriority: number = 7
  ): string {
    return this.trackResource(
      'timer',
      description,
      async () => {
        clearTimeout(timer);
      },
      { timerId: timer[Symbol.toPrimitive]() },
      cleanupPriority
    );
  }

  /**
   * Cleanup a specific resource
   */
  async cleanupResource(resourceId: string): Promise<boolean> {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;

    const startTime = Date.now();

    try {
      await resource.cleanupHandler();
      this.resources.delete(resourceId);

      const cleanupEvent: CleanupEvent = {
        resourceId,
        resourceType: resource.type,
        success: true,
        timestamp: Date.now(),
        cleanupTimeMs: Date.now() - startTime,
      };

      this.cleanupHistory.push(cleanupEvent);
      this.emit('resourceCleaned', cleanupEvent);

      return true;
    } catch (error) {
      const cleanupEvent: CleanupEvent = {
        resourceId,
        resourceType: resource.type,
        success: false,
        error: error as Error,
        timestamp: Date.now(),
        cleanupTimeMs: Date.now() - startTime,
      };

      this.cleanupHistory.push(cleanupEvent);
      this.emit('resourceCleanupFailed', cleanupEvent);

      // Log cleanup failure
      if (this.options.errorHandler) {
        const context: ErrorContext = {
          timestamp: Date.now(),
          additionalData: {
            resourceId,
            resourceType: resource.type,
            description: resource.description,
            cleanupTimeMs: cleanupEvent.cleanupTimeMs,
          },
        };

        this.options.errorHandler.handleError(
          error as Error,
          'CLEANUP_FAILED',
          context,
          'warning',
          true
        );
      }

      return false;
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanupAllResources(): Promise<{
    total: number;
    successful: number;
    failed: number;
  }> {
    const resourceIds = Array.from(this.resources.keys());
    let successful = 0;
    let failed = 0;

    // Cleanup resources in priority order (lowest priority first)
    const sortedResources = Array.from(this.resources.values()).sort(
      (a, b) => a.cleanupPriority - b.cleanupPriority
    );

    for (const resource of sortedResources) {
      const success = await this.cleanupResource(resource.id);
      if (success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      total: resourceIds.length,
      successful,
      failed,
    };
  }

  /**
   * Cleanup expired resources
   */
  private async cleanupExpiredResources(): Promise<void> {
    const now = Date.now();
    const expiredResources = Array.from(this.resources.values()).filter(
      resource => now - resource.createdAt > this.options.resourceExpiryMs
    );

    for (const resource of expiredResources) {
      await this.cleanupResource(resource.id);
    }
  }

  /**
   * Cleanup oldest resources when limit exceeded
   */
  private async cleanupOldestResources(): Promise<void> {
    const resourcesToRemove = this.resources.size - this.options.maxResources;
    if (resourcesToRemove <= 0) return;

    // Get oldest resources
    const sortedResources = Array.from(this.resources.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );

    const resourcesToCleanup = sortedResources.slice(0, resourcesToRemove);

    for (const resource of resourcesToCleanup) {
      await this.cleanupResource(resource.id);
    }
  }

  /**
   * Generate unique resource ID
   */
  private generateResourceId(type: ResourceType): string {
    return `resource_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all tracked resources
   */
  getTrackedResources(): ResourceInfo[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get resources by type
   */
  getResourcesByType(type: ResourceType): ResourceInfo[] {
    return Array.from(this.resources.values()).filter(resource => resource.type === type);
  }

  /**
   * Get resource by ID
   */
  getResourceById(resourceId: string): ResourceInfo | undefined {
    return this.resources.get(resourceId);
  }

  /**
   * Get cleanup statistics
   */
  getCleanupStatistics(): {
    totalTracked: number;
    trackedByType: Record<ResourceType, number>;
    totalCleanups: number;
    successfulCleanups: number;
    failedCleanups: number;
    cleanupSuccessRate: number;
  } {
    const trackedByType: Record<ResourceType, number> = {
      file: 0,
      directory: 0,
      process: 0,
      network: 0,
      memory: 0,
      timer: 0,
      event: 0,
      custom: 0,
    };

    let successfulCleanups = 0;
    let failedCleanups = 0;

    for (const resource of this.resources.values()) {
      trackedByType[resource.type] = (trackedByType[resource.type] || 0) + 1;
    }

    for (const event of this.cleanupHistory) {
      if (event.success) {
        successfulCleanups++;
      } else {
        failedCleanups++;
      }
    }

    const totalCleanups = this.cleanupHistory.length;
    const cleanupSuccessRate = totalCleanups > 0 ? (successfulCleanups / totalCleanups) * 100 : 0;

    return {
      totalTracked: this.resources.size,
      trackedByType,
      totalCleanups,
      successfulCleanups,
      failedCleanups,
      cleanupSuccessRate,
    };
  }

  /**
   * Get recent cleanup events
   */
  getRecentCleanupEvents(limit: number = 50): CleanupEvent[] {
    return this.cleanupHistory.slice(-limit);
  }

  /**
   * Clear cleanup history
   */
  clearCleanupHistory(): void {
    this.cleanupHistory = [];
    this.emit('cleanupHistoryCleared', { timestamp: Date.now() });
  }

  /**
   * Remove resource from tracking without cleanup
   */
  untrackResource(resourceId: string): boolean {
    const existed = this.resources.delete(resourceId);
    if (existed) {
      this.emit('resourceUntracked', { resourceId, timestamp: Date.now() });
    }
    return existed;
  }

  /**
   * Set cleanup options
   */
  setOptions(options: Partial<ResourceCleanerOptions>): void {
    const wasMonitoring = this.options.autoCleanup;
    this.options = { ...this.options, ...options };

    // Restart monitoring if options changed
    if (wasMonitoring !== this.options.autoCleanup) {
      this.stopCleanupMonitoring();
      if (this.options.autoCleanup) {
        this.startCleanupMonitoring();
      }
    }
  }

  /**
   * Get current options
   */
  getOptions(): ResourceCleanerOptions {
    return { ...this.options };
  }

  /**
   * Dispose of all resources and cleanup
   */
  async dispose(): Promise<void> {
    this.stopCleanupMonitoring();
    await this.cleanupAllResources();
    this.cleanupHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Factory function to create resource cleaner
 */
export function createResourceCleaner(options?: Partial<ResourceCleanerOptions>): ResourceCleaner {
  return new ResourceCleaner(options);
}