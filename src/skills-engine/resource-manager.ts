import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Resource tracking information
export interface ResourceInfo {
  type: 'process' | 'file' | 'directory' | 'network_connection' | 'memory';
  id: string;
  created: number;
  size?: number;
  description: string;
}

// Cleanup options
export interface CleanupOptions {
  removeTempFiles: boolean;
  closeNetworkConnections: boolean;
  terminateProcesses: boolean;
  freeMemory: boolean;
  timeoutMs: number;
}

// Resource usage statistics
export interface ResourceUsage {
  totalProcesses: number;
  totalFiles: number;
  totalDirectories: number;
  totalNetworkConnections: number;
  memoryUsageBytes: number;
  diskUsageBytes: number;
}

/**
 * Resource manager for sandbox cleanup and resource tracking
 */
export class ResourceManager extends EventEmitter {
  private resources: Map<string, ResourceInfo> = new Map();
  private tempDirectories: Set<string> = new Set();
  private activeProcesses: Set<number> = new Set();
  private networkConnections: Set<any> = new Set();

  constructor(private options: CleanupOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      removeTempFiles: true,
      closeNetworkConnections: true,
      terminateProcesses: true,
      freeMemory: true,
      timeoutMs: 5000, // 5 second cleanup timeout
      ...this.options
    };
  }

  /**
   * Track a new resource
   */
  trackResource(resource: Omit<ResourceInfo, 'created'>): string {
    const resourceId = this.generateResourceId();
    const fullResource: ResourceInfo = {
      ...resource,
      created: Date.now()
    };

    this.resources.set(resourceId, fullResource);

    // Add to specific tracking sets
    if (resource.type === 'process' && resource.id) {
      this.activeProcesses.add(parseInt(resource.id));
    } else if (resource.type === 'directory') {
      this.tempDirectories.add(resource.id);
    }

    this.emit('resourceTracked', fullResource);
    return resourceId;
  }

  /**
   * Stop tracking a resource
   */
  untrackResource(resourceId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;

    // Remove from specific tracking sets
    if (resource.type === 'process' && resource.id) {
      this.activeProcesses.delete(parseInt(resource.id));
    } else if (resource.type === 'directory') {
      this.tempDirectories.delete(resource.id);
    }

    this.resources.delete(resourceId);
    this.emit('resourceUntracked', resource);
    return true;
  }

  /**
   * Track a process
   */
  trackProcess(pid: number, description: string): string {
    return this.trackResource({
      type: 'process',
      id: pid.toString(),
      description
    });
  }

  /**
   * Track a file
   */
  trackFile(filePath: string, description: string, size?: number): string {
    return this.trackResource({
      type: 'file',
      id: filePath,
      description,
      size
    });
  }

  /**
   * Track a directory
   */
  trackDirectory(dirPath: string, description: string): string {
    return this.trackResource({
      type: 'directory',
      id: dirPath,
      description
    });
  }

  /**
   * Track a network connection
   */
  trackNetworkConnection(connection: any, description: string): string {
    const connectionId = this.generateResourceId();
    this.networkConnections.add(connection);

    return this.trackResource({
      type: 'network_connection',
      id: connectionId,
      description
    });
  }

  /**
   * Perform comprehensive cleanup
   */
  async cleanup(): Promise<void> {
    const cleanupStart = Date.now();
    let errors: Error[] = [];

    try {
      // Terminate processes
      if (this.options.terminateProcesses) {
        errors = errors.concat(await this.terminateProcesses());
      }

      // Close network connections
      if (this.options.closeNetworkConnections) {
        errors = errors.concat(await this.closeNetworkConnections());
      }

      // Remove temporary files and directories
      if (this.options.removeTempFiles) {
        errors = errors.concat(await this.cleanupTempFiles());
      }

      // Free memory
      if (this.options.freeMemory) {
        errors = errors.concat(await this.freeMemory());
      }

      // Clear all tracking
      this.clearAllTracking();

      const cleanupTime = Date.now() - cleanupStart;
      this.emit('cleanupComplete', {
        durationMs: cleanupTime,
        errors: errors.length,
        totalResources: this.resources.size
      });

      if (errors.length > 0) {
        throw new AggregateError(errors, `Cleanup completed with ${errors.length} errors`);
      }

    } catch (error) {
      this.emit('cleanupError', error);
      throw error;
    }
  }

  /**
   * Terminate all tracked processes
   */
  private async terminateProcesses(): Promise<Error[]> {
    const errors: Error[] = [];

    for (const pid of this.activeProcesses) {
      try {
        process.kill(pid, 'SIGTERM');

        // Wait a bit for graceful termination
        await new Promise(resolve => setTimeout(resolve, 100));

        // Force kill if still running
        try {
          process.kill(pid, 0); // Check if process exists
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already terminated
        }

        this.emit('processTerminated', pid);
      } catch (error) {
        errors.push(new Error(`Failed to terminate process ${pid}: ${error}`));
      }
    }

    this.activeProcesses.clear();
    return errors;
  }

  /**
   * Close all network connections
   */
  private async closeNetworkConnections(): Promise<Error[]> {
    const errors: Error[] = [];

    for (const connection of this.networkConnections) {
      try {
        if (typeof connection.destroy === 'function') {
          connection.destroy();
        } else if (typeof connection.close === 'function') {
          connection.close();
        } else if (typeof connection.end === 'function') {
          connection.end();
        }

        this.emit('connectionClosed', connection);
      } catch (error) {
        errors.push(new Error(`Failed to close network connection: ${error}`));
      }
    }

    this.networkConnections.clear();
    return errors;
  }

  /**
   * Clean up temporary files and directories
   */
  private async cleanupTempFiles(): Promise<Error[]> {
    const errors: Error[] = [];

    // Clean up tracked directories
    for (const dirPath of this.tempDirectories) {
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          this.emit('directoryRemoved', dirPath);
        }
      } catch (error) {
        errors.push(new Error(`Failed to remove directory ${dirPath}: ${error}`));
      }
    }

    // Clean up tracked files
    for (const [resourceId, resource] of this.resources) {
      if (resource.type === 'file') {
        try {
          if (fs.existsSync(resource.id)) {
            fs.unlinkSync(resource.id);
            this.emit('fileRemoved', resource.id);
          }
        } catch (error) {
          errors.push(new Error(`Failed to remove file ${resource.id}: ${error}`));
        }
      }
    }

    this.tempDirectories.clear();
    return errors;
  }

  /**
   * Free memory resources
   */
  private async freeMemory(): Promise<Error[]> {
    const errors: Error[] = [];

    try {
      // Clear large data structures
      this.resources.clear();

      // Suggest garbage collection (Node.js may not honor this)
      if (global.gc) {
        global.gc();
      }

      this.emit('memoryFreed');
    } catch (error) {
      errors.push(new Error(`Failed to free memory: ${error}`));
    }

    return errors;
  }

  /**
   * Clear all tracking
   */
  private clearAllTracking(): void {
    this.resources.clear();
    this.tempDirectories.clear();
    this.activeProcesses.clear();
    this.networkConnections.clear();
  }

  /**
   * Get resource usage statistics
   */
  getResourceUsage(): ResourceUsage {
    let totalFiles = 0;
    let totalDirectories = 0;
    let memoryUsageBytes = 0;
    let diskUsageBytes = 0;

    for (const resource of this.resources.values()) {
      switch (resource.type) {
        case 'file':
          totalFiles++;
          diskUsageBytes += resource.size || 0;
          break;
        case 'directory':
          totalDirectories++;
          break;
        case 'memory':
          memoryUsageBytes += resource.size || 0;
          break;
      }
    }

    return {
      totalProcesses: this.activeProcesses.size,
      totalFiles,
      totalDirectories,
      totalNetworkConnections: this.networkConnections.size,
      memoryUsageBytes,
      diskUsageBytes
    };
  }

  /**
   * Get all tracked resources
   */
  getAllResources(): ResourceInfo[] {
    return Array.from(this.resources.values());
  }

  /**
   * Find resources by type
   */
  findResourcesByType(type: ResourceInfo['type']): ResourceInfo[] {
    return Array.from(this.resources.values()).filter(
      resource => resource.type === type
    );
  }

  /**
   * Find resources by description pattern
   */
  findResourcesByDescription(pattern: RegExp): ResourceInfo[] {
    return Array.from(this.resources.values()).filter(
      resource => pattern.test(resource.description)
    );
  }

  /**
   * Generate unique resource ID
   */
  private generateResourceId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a secure temporary directory
   */
  createSecureTempDir(prefix: string = 'wtc'): string {
    const tempDir = path.join(
      os.tmpdir(),
      `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    fs.mkdirSync(tempDir, { recursive: true });

    // Set restrictive permissions
    try {
      fs.chmodSync(tempDir, 0o700); // Read/write/execute for owner only
    } catch {
      // Permission changes might fail on some systems
    }

    this.trackDirectory(tempDir, `Secure temporary directory: ${prefix}`);
    return tempDir;
  }

  /**
   * Force garbage collection (if available)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      this.emit('garbageCollectionForced');
    }
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Check if cleanup is needed
   */
  needsCleanup(): boolean {
    return (
      this.activeProcesses.size > 0 ||
      this.networkConnections.size > 0 ||
      this.tempDirectories.size > 0 ||
      this.resources.size > 0
    );
  }
}