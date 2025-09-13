import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Filesystem access control configuration
export interface FilesystemGuardOptions {
  allowedDirectories: string[];
  readOnly?: boolean;
  maxFileSizeBytes?: number;
  blockedExtensions?: string[];
  blockedPatterns?: RegExp[];
}

// Filesystem access event
export interface FilesystemAccessEvent {
  type: 'read' | 'write' | 'delete' | 'execute';
  path: string;
  timestamp: number;
  allowed: boolean;
  reason?: string;
}

/**
 * Filesystem access guard for sandbox environment
 * Monitors and controls filesystem access during script execution
 */
export class FilesystemGuard extends EventEmitter {
  private accessEvents: FilesystemAccessEvent[] = [];
  private originalFsMethods: any = {};

  constructor(private options: FilesystemGuardOptions) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
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
      ],
      ...this.options
    };
  }

  /**
   * Enable filesystem access monitoring
   */
  enableMonitoring(): void {
    this.backupOriginalMethods();
    this.installHooks();
  }

  /**
   * Disable filesystem access monitoring
   */
  disableMonitoring(): void {
    this.restoreOriginalMethods();
  }

  /**
   * Backup original fs methods
   */
  private backupOriginalMethods(): void {
    this.originalFsMethods = {
      readFileSync: fs.readFileSync,
      writeFileSync: fs.writeFileSync,
      appendFileSync: fs.appendFileSync,
      unlinkSync: fs.unlinkSync,
      renameSync: fs.renameSync,
      copyFileSync: fs.copyFileSync,
      mkdirSync: fs.mkdirSync,
      rmdirSync: fs.rmdirSync,
      statSync: fs.statSync,
      accessSync: fs.accessSync,
      readdirSync: fs.readdirSync
    };
  }

  /**
   * Restore original fs methods
   */
  private restoreOriginalMethods(): void {
    Object.assign(fs, this.originalFsMethods);
  }

  /**
   * Install filesystem access hooks
   */
  private installHooks(): void {
    // Read operations
    fs.readFileSync = this.createReadHook(fs.readFileSync);
    fs.statSync = this.createReadHook(fs.statSync);
    fs.accessSync = this.createReadHook(fs.accessSync);
    fs.readdirSync = this.createReadHook(fs.readdirSync);

    // Write operations
    if (!this.options.readOnly) {
      fs.writeFileSync = this.createWriteHook(fs.writeFileSync);
      fs.appendFileSync = this.createWriteHook(fs.appendFileSync);
      fs.unlinkSync = this.createWriteHook(fs.unlinkSync);
      fs.renameSync = this.createWriteHook(fs.renameSync);
      fs.copyFileSync = this.createWriteHook(fs.copyFileSync);
      fs.mkdirSync = this.createWriteHook(fs.mkdirSync);
      fs.rmdirSync = this.createWriteHook(fs.rmdirSync);
    } else {
      // Block all write operations in read-only mode
      this.blockWriteOperations();
    }
  }

  /**
   * Create read operation hook
   */
  private createReadHook(originalMethod: Function): any {
    return (...args: any[]) => {
      const filePath = this.getFilePathFromArgs(args);

      if (filePath && !this.isPathAllowed(filePath, 'read')) {
        this.recordAccessEvent('read', filePath, false, 'Access denied by sandbox policy');
        throw new Error(`Filesystem access denied: ${filePath}`);
      }

      this.recordAccessEvent('read', filePath, true);
      return originalMethod.apply(fs, args);
    };
  }

  /**
   * Create write operation hook
   */
  private createWriteHook(originalMethod: Function): any {
    return (...args: any[]) => {
      const filePath = this.getFilePathFromArgs(args);

      if (filePath && !this.isPathAllowed(filePath, 'write')) {
        this.recordAccessEvent('write', filePath, false, 'Write access denied by sandbox policy');
        throw new Error(`Filesystem write access denied: ${filePath}`);
      }

      // Check file size for write operations
      if (args[1] && typeof args[1] === 'string' && args[1].length > this.options.maxFileSizeBytes!) {
        this.recordAccessEvent('write', filePath, false, 'File size exceeds limit');
        throw new Error(`File size exceeds maximum allowed size: ${this.options.maxFileSizeBytes} bytes`);
      }

      this.recordAccessEvent('write', filePath, true);
      return originalMethod.apply(fs, args);
    };
  }

  /**
   * Block all write operations
   */
  private blockWriteOperations(): void {
    const blockMethod = (methodName: string) => {
      return (...args: any[]) => {
        const filePath = this.getFilePathFromArgs(args);
        this.recordAccessEvent('write', filePath, false, `Write operation ${methodName} blocked in read-only mode`);
        throw new Error(`Write operation ${methodName} is blocked in sandbox read-only mode`);
      };
    };

    fs.writeFileSync = blockMethod('writeFileSync');
    fs.appendFileSync = blockMethod('appendFileSync');
    fs.unlinkSync = blockMethod('unlinkSync');
    fs.renameSync = blockMethod('renameSync');
    fs.copyFileSync = blockMethod('copyFileSync');
    fs.mkdirSync = blockMethod('mkdirSync');
    fs.rmdirSync = blockMethod('rmdirSync');
  }

  /**
   * Extract file path from method arguments
   */
  private getFilePathFromArgs(args: any[]): string | null {
    for (const arg of args) {
      if (typeof arg === 'string' && arg.length > 0) {
        try {
          return path.resolve(arg);
        } catch {
          // Ignore invalid paths
        }
      }
    }
    return null;
  }

  /**
   * Check if path is allowed for access
   */
  private isPathAllowed(filePath: string, operation: 'read' | 'write'): boolean {
    const resolvedPath = path.resolve(filePath);

    // Check blocked extensions
    const ext = path.extname(resolvedPath).toLowerCase();
    if (this.options.blockedExtensions?.includes(ext)) {
      return false;
    }

    // Check blocked patterns
    for (const pattern of this.options.blockedPatterns || []) {
      if (pattern.test(resolvedPath)) {
        return false;
      }
    }

    // Check allowed directories
    let isAllowed = false;
    for (const allowedDir of this.options.allowedDirectories) {
      const resolvedAllowedDir = path.resolve(allowedDir);
      if (resolvedPath.startsWith(resolvedAllowedDir + path.sep) ||
          resolvedPath === resolvedAllowedDir) {
        isAllowed = true;
        break;
      }
    }

    // Additional checks for write operations
    if (operation === 'write' && isAllowed) {
      // Check if parent directory is writable
      const parentDir = path.dirname(resolvedPath);
      if (!this.isDirectoryWritable(parentDir)) {
        return false;
      }
    }

    return isAllowed;
  }

  /**
   * Check if directory is writable
   */
  private isDirectoryWritable(dirPath: string): boolean {
    try {
      // Try to create a test file
      const testFile = path.join(dirPath, `.wtc-test-${Date.now()}.tmp`);
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record filesystem access event
   */
  private recordAccessEvent(
    type: FilesystemAccessEvent['type'],
    path: string | null,
    allowed: boolean,
    reason?: string
  ): void {
    const event: FilesystemAccessEvent = {
      type,
      path: path || 'unknown',
      timestamp: Date.now(),
      allowed,
      reason
    };

    this.accessEvents.push(event);
    this.emit('filesystemAccess', event);

    // Log security events for denied access
    if (!allowed) {
      this.emit('securityEvent', {
        type: 'filesystem_access_denied',
        timestamp: Date.now(),
        details: `${type} access denied for ${path}: ${reason}`,
        severity: 'high'
      });
    }
  }

  /**
   * Get all filesystem access events
   */
  getAccessEvents(): FilesystemAccessEvent[] {
    return [...this.accessEvents];
  }

  /**
   * Clear access events
   */
  clearAccessEvents(): void {
    this.accessEvents = [];
  }

  /**
   * Create a secure temporary directory for sandbox use
   */
  createSecureTempDir(): string {
    const tempDir = path.join(
      this.options.allowedDirectories[0] || os.tmpdir(),
      `wtc-sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    fs.mkdirSync(tempDir, { recursive: true });

    // Set restrictive permissions
    try {
      fs.chmodSync(tempDir, 0o700); // Read/write/execute for owner only
    } catch {
      // Permission changes might fail on some systems
    }

    return tempDir;
  }

  /**
   * Clean up temporary directories
   */
  cleanupTempDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmdirSync(dirPath, { recursive: true });
      }
    } catch (error) {
      // Log cleanup errors but don't throw
      this.emit('securityEvent', {
        type: 'cleanup_error',
        timestamp: Date.now(),
        details: `Failed to cleanup temp directory ${dirPath}: ${error}`,
        severity: 'low'
      });
    }
  }
}