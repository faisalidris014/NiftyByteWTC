import Database from 'better-sqlite3';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { QueueConfig, EncryptionResult, QUEUE_ERROR_CODES } from './types';

export class EncryptedDatabase {
  private db: Database.Database;
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = config;
    this.ensureDataDirectory();
    this.db = new Database(this.config.databasePath);
    this.initializeDatabase();
  }

  private ensureDataDirectory(): void {
    const dir = dirname(this.config.databasePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private initializeDatabase(): void {
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('ticket', 'feedback', 'log')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
        priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
        encrypted_data TEXT NOT NULL,
        encryption_iv TEXT NOT NULL,
        encryption_auth_tag TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        next_retry_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_queue_items_status ON queue_items(status);
      CREATE INDEX IF NOT EXISTS idx_queue_items_type ON queue_items(type);
      CREATE INDEX IF NOT EXISTS idx_queue_items_priority ON queue_items(priority);
      CREATE INDEX IF NOT EXISTS idx_queue_items_retry ON queue_items(next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_queue_items_created ON queue_items(created_at);

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER,
        items_synced INTEGER NOT NULL,
        items_failed INTEGER NOT NULL,
        error_message TEXT,
        connection_type TEXT,
        bandwidth_kbps INTEGER
      );

      CREATE TABLE IF NOT EXISTS database_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Insert default metadata if not exists
    const metadataStmt = this.db.prepare(
      'INSERT OR IGNORE INTO database_metadata (key, value) VALUES (?, ?)'
    );
    metadataStmt.run('schema_version', '1');
    metadataStmt.run('created_at', Date.now().toString());
  }

  public encryptData(data: any): EncryptionResult {
    try {
      const jsonData = JSON.stringify(data);
      const iv = randomBytes(16);

      // Use SHA-256 to derive a consistent 32-byte key from the encryption key
      const crypto = require('crypto');
      const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();

      const cipher = createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(jsonData, 'utf8', 'base64');
      encrypted += cipher.final('base64');


      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: '' // Not used in CBC mode
      };
    } catch (error) {
      throw new Error(`${QUEUE_ERROR_CODES.ENCRYPTION_ERROR}: ${(error as Error).message}`);
    }
  }

  public decryptData(encrypted: string, iv: string, authTag: string): any {
    try {

      const ivBuffer = Buffer.from(iv, 'hex');
      const crypto = require('crypto');
      const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();

      const decipher = createDecipheriv('aes-256-cbc', key, ivBuffer);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption failed:', (error as Error).message);
      throw new Error(`${QUEUE_ERROR_CODES.DECRYPTION_ERROR}: ${(error as Error).message}`);
    }
  }

  public getDatabase(): Database.Database {
    return this.db;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  public backup(destinationPath: string): void {
    this.db.backup(destinationPath)
      .then(() => {
        console.log(`Backup completed successfully to: ${destinationPath}`);
      })
      .catch((error) => {
        throw new Error(`Backup failed: ${(error as Error).message}`);
      });
  }

  public compact(): void {
    this.db.exec('VACUUM');
  }

  public getStats(): {
    sizeBytes: number;
    itemCount: number;
    tableSizes: Record<string, number>;
  } {
    const result = this.db.prepare(`
      SELECT
        SUM(size_bytes) as total_size,
        COUNT(*) as total_items
      FROM queue_items
    `).get() as { total_size: number; total_items: number };

    const tableSizes = this.db.prepare(`
      SELECT
        name as table_name,
        SUM(pgsize) as size_bytes
      FROM dbstat
      GROUP BY name
    `).all() as Array<{ table_name: string; size_bytes: number }>;

    return {
      sizeBytes: result.total_size || 0,
      itemCount: result.total_items || 0,
      tableSizes: tableSizes.reduce((acc, row) => {
        acc[row.table_name] = row.size_bytes;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  public isCorrupted(): boolean {
    try {
      // Simple integrity check
      this.db.prepare('SELECT 1').get();
      return false;
    } catch {
      return true;
    }
  }

  public repair(): void {
    if (this.isCorrupted()) {
      this.close();
      // Try to recover by creating a new database
      const backupPath = this.config.databasePath + '.backup' + Date.now();

      try {
        // Try to backup corrupted database
        if (existsSync(this.config.databasePath)) {
          const corruptedDb = new Database(this.config.databasePath);
          corruptedDb.backup(backupPath).catch(() => {
            // Ignore backup errors
          });
          corruptedDb.close();
        }
      } catch {
        // Ignore backup errors
      }

      // Remove corrupted database
      if (existsSync(this.config.databasePath)) {
        try {
          require('fs').unlinkSync(this.config.databasePath);
        } catch {
          // Ignore deletion errors
        }
      }

      // Create new database
      this.db = new Database(this.config.databasePath);
      this.initializeDatabase();
    }
  }
}