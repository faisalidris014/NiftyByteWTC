import { LogEntry, LogDestination, LogRotationConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

interface FileDestinationOptions {
  filePath: string;
  rotation?: LogRotationConfig;
  format?: 'json' | 'text';
}

export class FileDestination implements LogDestination {
  private fileHandle: fs.promises.FileHandle | null = null;
  private currentFileSize = 0;
  private rotationTimer: NodeJS.Timeout | null = null;

  constructor(private options: FileDestinationOptions) {
    this.ensureDirectoryExists();

    if (options.rotation?.enabled) {
      this.setupRotation();
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.options.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async setupRotation(): Promise<void> {
    // Check file size periodically
    this.rotationTimer = setInterval(() => {
      this.checkRotation();
    }, 60000); // Check every minute

    // Also check on each write
    await this.checkRotation();
  }

  private async checkRotation(): Promise<void> {
    if (!this.options.rotation?.enabled) return;

    try {
      const stats = await stat(this.options.filePath).catch(() => null);
      if (stats && stats.size > this.options.rotation.maxSizeBytes) {
        await this.rotateFile();
      }
    } catch (error) {
      // File might not exist yet
    }
  }

  private async rotateFile(): Promise<void> {
    if (!this.options.rotation?.enabled) return;

    try {
      // Close current file handle
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }

      // Generate rotated filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = `${this.options.filePath}.${timestamp}`;

      // Rename current file
      if (fs.existsSync(this.options.filePath)) {
        fs.renameSync(this.options.filePath, rotatedPath);

        // Compress if enabled
        if (this.options.rotation.compress) {
          await this.compressFile(rotatedPath);
        }
      }

      // Clean up old files
      await this.cleanupOldFiles();

      // Reopen file handle
      await this.ensureFileHandle();
      this.currentFileSize = 0;

    } catch (error) {
      console.error('File rotation failed:', error);
    }
  }

  private async compressFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath);
      const compressed = zlib.gzipSync(content);
      await writeFile(`${filePath}.gz`, compressed);
      await unlink(filePath);
    } catch (error) {
      console.error('File compression failed:', error);
    }
  }

  private async cleanupOldFiles(): Promise<void> {
    if (!this.options.rotation?.enabled) return;

    try {
      const dir = path.dirname(this.options.filePath);
      const files = await readdir(dir);
      const now = Date.now();
      const retentionMs = this.options.rotation.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith(path.basename(this.options.filePath)) && file !== path.basename(this.options.filePath)) {
          const filePath = path.join(dir, file);
          const stats = await stat(filePath);

          if (now - stats.mtimeMs > retentionMs) {
            await unlink(filePath);
          }
        }
      }
    } catch (error) {
      console.error('File cleanup failed:', error);
    }
  }

  private async ensureFileHandle(): Promise<void> {
    if (!this.fileHandle) {
      this.fileHandle = await fs.promises.open(this.options.filePath, 'a');

      // Get current file size
      try {
        const stats = await stat(this.options.filePath);
        this.currentFileSize = stats.size;
      } catch {
        this.currentFileSize = 0;
      }
    }
  }

  async write(entry: LogEntry): Promise<void> {
    await this.ensureFileHandle();

    const logLine = this.formatEntry(entry) + '\n';
    const buffer = Buffer.from(logLine);

    await this.fileHandle!.write(buffer);
    this.currentFileSize += buffer.length;

    // Check rotation after write
    await this.checkRotation();
  }

  private formatEntry(entry: LogEntry): string {
    if (this.options.format === 'json') {
      return JSON.stringify({
        ...entry,
        timestamp: new Date(entry.timestamp).toISOString()
      });
    }

    // Default text format
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);

    let line = `[${timestamp}] ${level} ${entry.message}`;

    if (entry.correlationId) {
      line += ` [correlation:${entry.correlationId}]`;
    }

    if (entry.skillId) {
      line += ` [skill:${entry.skillId}]`;
    }

    if (entry.durationMs !== undefined) {
      line += ` [duration:${entry.durationMs}ms]`;
    }

    if (entry.context) {
      line += ` [context:${JSON.stringify(entry.context)}]`;
    }

    return line;
  }

  async flush(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.sync();
    }
  }

  async close(): Promise<void> {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }
}