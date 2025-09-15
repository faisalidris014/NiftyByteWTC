// Immutable Audit Logging System
// Secure, tamper-proof audit logging with cryptographic verification and retention policies

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: string;
  userId?: string;
  resource: string;
  action: string;
  status: 'success' | 'failure' | 'warning';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  previousHash?: string;
  currentHash: string;
  signature?: string;
  retentionPeriod: number;
}

interface AuditLogConfig {
  logDirectory: string;
  retentionPeriod: number; // milliseconds
  encryptionKey?: Buffer;
  signingKey?: Buffer;
  maxFileSize: number; // bytes
  compression: boolean;
  integrityChecking: boolean;
  realTimeSigning: boolean;
}

export class ImmutableAuditLogger extends EventEmitter {
  private static instance: ImmutableAuditLogger;
  private config: AuditLogConfig;
  private currentFile: string = '';
  private currentFileSize: number = 0;
  private chainHash: string = '';
  private readonly DEFAULT_CONFIG: AuditLogConfig = {
    logDirectory: path.join(process.cwd(), 'logs', 'audit'),
    retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
    maxFileSize: 10 * 1024 * 1024, // 10MB
    compression: true,
    integrityChecking: true,
    realTimeSigning: true
  };

  private constructor(config: Partial<AuditLogConfig> = {}) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.initialize().catch(console.error);
  }

  static getInstance(config?: Partial<AuditLogConfig>): ImmutableAuditLogger {
    if (!ImmutableAuditLogger.instance) {
      ImmutableAuditLogger.instance = new ImmutableAuditLogger(config);
    }
    return ImmutableAuditLogger.instance;
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.logDirectory, { recursive: true, mode: 0o700 });
      await fs.chmod(this.config.logDirectory, 0o700); // Restrictive permissions
      await this.loadChainState();
      this.setupMaintenanceIntervals();
    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
    }
  }

  private async loadChainState(): Promise<void> {
    try {
      const stateFile = path.join(this.config.logDirectory, '.chainstate');
      const stateData = await fs.readFile(stateFile, 'utf8');
      const state = JSON.parse(stateData);
      this.chainHash = state.lastHash || '';
      this.currentFile = state.currentFile || '';

      if (this.currentFile) {
        const stats = await fs.stat(this.currentFile);
        this.currentFileSize = stats.size;
      }
    } catch {
      // No existing state, start fresh
      this.chainHash = this.generateGenesisHash();
      await this.rotateLogFile();
    }
  }

  private async saveChainState(): Promise<void> {
    const stateFile = path.join(this.config.logDirectory, '.chainstate');
    const state = {
      lastHash: this.chainHash,
      currentFile: this.currentFile,
      timestamp: Date.now()
    };
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), {
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
  }

  private generateGenesisHash(): string {
    const genesisData = `GENESIS_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    return crypto.createHash('sha256').update(genesisData).digest('hex');
  }

  private setupMaintenanceIntervals(): void {
    // File rotation check every minute
    setInterval(() => {
      this.checkFileRotation().catch(console.error);
    }, 60000);

    // Retention cleanup every hour
    setInterval(() => {
      this.cleanupExpiredLogs().catch(console.error);
    }, 3600000);

    // Integrity verification every 6 hours
    setInterval(() => {
      this.verifyLogIntegrity().catch(console.error);
    }, 21600000);
  }

  async logEvent(
    eventType: string,
    resource: string,
    action: string,
    status: 'success' | 'failure' | 'warning',
    details: Record<string, any> = {},
    metadata: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: this.generateEntryId(),
      timestamp: Date.now(),
      eventType,
      userId: metadata.userId,
      resource,
      action,
      status,
      details,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      correlationId: metadata.correlationId,
      previousHash: this.chainHash,
      currentHash: '',
      retentionPeriod: this.config.retentionPeriod
    };

    // Calculate hash for this entry
    entry.currentHash = this.calculateEntryHash(entry);

    // Add cryptographic signature if enabled
    if (this.config.signingKey && this.config.realTimeSigning) {
      entry.signature = this.signEntry(entry);
    }

    // Write to log file
    await this.writeEntryToFile(entry);

    // Update chain hash
    this.chainHash = entry.currentHash;
    await this.saveChainState();

    this.emit('entryLogged', entry);
    return entry;
  }

  private generateEntryId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private calculateEntryHash(entry: Omit<AuditLogEntry, 'currentHash'>): string {
    const hashData = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      resource: entry.resource,
      action: entry.action,
      status: entry.status,
      details: entry.details,
      previousHash: entry.previousHash
    });

    return crypto.createHash('sha256').update(hashData).digest('hex');
  }

  private signEntry(entry: AuditLogEntry): string {
    if (!this.config.signingKey) {
      throw new Error('Signing key not configured');
    }

    const signData = JSON.stringify({
      hash: entry.currentHash,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash
    });

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signData);
    sign.end();

    return sign.sign(this.config.signingKey, 'base64');
  }

  private async writeEntryToFile(entry: AuditLogEntry): Promise<void> {
    // Check if we need to rotate the log file
    if (this.currentFileSize >= this.config.maxFileSize || !this.currentFile) {
      await this.rotateLogFile();
    }

    const entryJson = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.currentFile, entryJson, 'utf8');
    this.currentFileSize += Buffer.byteLength(entryJson, 'utf8');

    // Compress if enabled and file is getting large
    if (this.config.compression && this.currentFileSize > this.config.maxFileSize * 0.8) {
      await this.compressCurrentFile();
    }
  }

  private async rotateLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newFileName = `audit_${timestamp}.log`;
    this.currentFile = path.join(this.config.logDirectory, newFileName);
    this.currentFileSize = 0;

    // Create empty file with secure permissions
    await fs.writeFile(this.currentFile, '', {
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
    await this.saveChainState();

    this.emit('fileRotated', this.currentFile);
  }

  private async compressCurrentFile(): Promise<void> {
    if (!this.config.compression) return;

    try {
      const compressedFile = this.currentFile + '.gz';
      // In a real implementation, this would use zlib compression
      // For now, we'll just simulate compression

      const content = await fs.readFile(this.currentFile, 'utf8');
      // Simulate compression by just copying for now
      await fs.writeFile(compressedFile, content, {
        encoding: 'utf8',
        mode: 0o600 // Read/write for owner only
      });

      // Remove original file
      await fs.unlink(this.currentFile);

      this.currentFile = compressedFile;
      this.currentFileSize = (await fs.stat(compressedFile)).size;

      this.emit('fileCompressed', compressedFile);
    } catch (error) {
      console.error('File compression failed:', error);
    }
  }

  private async checkFileRotation(): Promise<void> {
    if (this.currentFileSize >= this.config.maxFileSize) {
      await this.rotateLogFile();
    }
  }

  private async cleanupExpiredLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDirectory);
      const now = Date.now();

      for (const file of files) {
        if (file === '.chainstate') continue;

        const filePath = path.join(this.config.logDirectory, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > this.config.retentionPeriod) {
          await fs.unlink(filePath);
          this.emit('logExpired', filePath);
        }
      }
    } catch (error) {
      console.error('Log cleanup failed:', error);
    }
  }

  async verifyLogIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    let previousHash = this.chainHash;

    try {
      const files = await fs.readdir(this.config.logDirectory);
      const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.log.gz'));

      for (const file of logFiles.sort()) {
        const filePath = path.join(this.config.logDirectory, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          try {
            const entry: AuditLogEntry = JSON.parse(line);

            // Verify hash chain
            if (entry.previousHash !== previousHash) {
              errors.push(`Hash chain broken in ${file}: ${entry.id}`);
            }

            // Verify entry hash
            const calculatedHash = this.calculateEntryHash(entry);
            if (calculatedHash !== entry.currentHash) {
              errors.push(`Hash mismatch in ${file}: ${entry.id}`);
            }

            // Verify signature if present
            if (entry.signature && this.config.signingKey) {
              const verifyData = JSON.stringify({
                hash: entry.currentHash,
                timestamp: entry.timestamp,
                previousHash: entry.previousHash
              });

              const verify = crypto.createVerify('RSA-SHA256');
              verify.update(verifyData);

              if (!verify.verify(this.config.signingKey, entry.signature, 'base64')) {
                errors.push(`Invalid signature in ${file}: ${entry.id}`);
              }
            }

            previousHash = entry.currentHash;
          } catch (parseError) {
            errors.push(`Invalid JSON in ${file}: ${parseError}`);
          }
        }
      }

      // Final chain verification
      if (previousHash !== this.chainHash) {
        errors.push('Final chain hash mismatch');
      }

    } catch (error) {
      errors.push(`Integrity verification failed: ${error}`);
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.emit('integrityCheckFailed', errors);
    } else {
      this.emit('integrityCheckPassed');
    }

    return { valid, errors };
  }

  async queryLogs(
    filters: Partial<{
      eventType: string;
      resource: string;
      action: string;
      status: string;
      userId: string;
      startTime: number;
      endTime: number;
      correlationId: string;
    }> = {},
    limit: number = 1000,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    const results: AuditLogEntry[] = [];

    try {
      const files = await fs.readdir(this.config.logDirectory);
      const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.log.gz'));

      for (const file of logFiles.sort().reverse()) {
        if (results.length >= limit) break;

        const filePath = path.join(this.config.logDirectory, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').reverse();

        for (const line of lines) {
          if (results.length >= limit) break;

          try {
            const entry: AuditLogEntry = JSON.parse(line);

            // Apply filters
            if (filters.eventType && entry.eventType !== filters.eventType) continue;
            if (filters.resource && entry.resource !== filters.resource) continue;
            if (filters.action && entry.action !== filters.action) continue;
            if (filters.status && entry.status !== filters.status) continue;
            if (filters.userId && entry.userId !== filters.userId) continue;
            if (filters.correlationId && entry.correlationId !== filters.correlationId) continue;
            if (filters.startTime && entry.timestamp < filters.startTime) continue;
            if (filters.endTime && entry.timestamp > filters.endTime) continue;

            // Skip if before offset
            if (offset > 0) {
              offset--;
              continue;
            }

            results.push(entry);
          } catch {
            // Skip invalid entries
          }
        }
      }
    } catch (error) {
      console.error('Log query failed:', error);
    }

    return results;
  }

  async exportLogs(
    format: 'json' | 'csv' | 'text' = 'json',
    filters?: Partial<AuditLogEntry>,
    outputPath?: string
  ): Promise<string> {
    const entries = await this.queryLogs(filters, 10000);
    let exportData: string;

    switch (format) {
      case 'json':
        exportData = JSON.stringify(entries, null, 2);
        break;
      case 'csv':
        exportData = this.convertToCSV(entries);
        break;
      case 'text':
        exportData = this.convertToText(entries);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const exportFile = outputPath || path.join(
      this.config.logDirectory,
      `audit_export_${Date.now()}.${format}`
    );

    await fs.writeFile(exportFile, exportData, {
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
    this.emit('logsExported', exportFile, format);

    return exportFile;
  }

  private convertToCSV(entries: AuditLogEntry[]): string {
    if (entries.length === 0) return '';

    const headers = ['timestamp', 'eventType', 'resource', 'action', 'status', 'userId', 'ipAddress'];
    const rows = [headers.join(',')];

    for (const entry of entries) {
      const row = headers.map(header => {
        const value = (entry as any)[header] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  private convertToText(entries: AuditLogEntry[]): string {
    return entries.map(entry =>
      `[${new Date(entry.timestamp).toISOString()}] ${entry.eventType} - ${entry.resource}.${entry.action} (${entry.status})`
    ).join('\n');
  }

  getConfig(): AuditLogConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<AuditLogConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveChainState();
    this.emit('configUpdated', this.config);
  }

  async shutdown(): Promise<void> {
    await this.saveChainState();
    this.removeAllListeners();
  }
}

// Utility functions for common audit logging patterns
export const AuditPatterns = {
  // Security events
  logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high',
    details: Record<string, any>,
    metadata?: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    }
  ): Promise<AuditLogEntry> {
    const logger = ImmutableAuditLogger.getInstance();
    return logger.logEvent(
      `security.${eventType}`,
      'system',
      'security_event',
      'success',
      { ...details, severity },
      metadata
    );
  },

  // User authentication
  logUserLogin(
    userId: string,
    success: boolean,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    }
  ): Promise<AuditLogEntry> {
    const logger = ImmutableAuditLogger.getInstance();
    return logger.logEvent(
      'auth.login',
      'user',
      'authenticate',
      success ? 'success' : 'failure',
      { userId },
      { ...metadata, userId }
    );
  },

  // Data access
  logDataAccess(
    userId: string,
    resource: string,
    action: string,
    success: boolean,
    details?: Record<string, any>,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    }
  ): Promise<AuditLogEntry> {
    const logger = ImmutableAuditLogger.getInstance();
    return logger.logEvent(
      'data.access',
      resource,
      action,
      success ? 'success' : 'failure',
      { userId, ...details },
      { ...metadata, userId }
    );
  },

  // Configuration changes
  logConfigChange(
    userId: string,
    component: string,
    changeType: string,
    details: Record<string, any>,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    }
  ): Promise<AuditLogEntry> {
    const logger = ImmutableAuditLogger.getInstance();
    return logger.logEvent(
      'config.change',
      component,
      changeType,
      'success',
      { userId, ...details },
      { ...metadata, userId }
    );
  }
};