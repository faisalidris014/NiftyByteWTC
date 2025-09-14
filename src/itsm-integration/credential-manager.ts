import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { ITSMConnectionConfig, ITSMCredentials } from './types';

interface EncryptedCredential {
  encryptedData: string;
  iv: string;
  salt: string;
  authTag: string;
  algorithm: string;
  version: string;
}

interface StoredConnection {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  encryptedCredentials: EncryptedCredential;
  config: Omit<ITSMConnectionConfig, 'credentials'>;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
}

export class CredentialManager {
  private encryptionKey: Buffer;
  private storage: Map<string, StoredConnection> = new Map();
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits

  constructor(masterKey: string) {
    // Derive initial key using a fixed salt for backward compatibility
    // This will be rotated when encrypting credentials
    this.encryptionKey = scryptSync(masterKey, Buffer.from('itsm-credential-salt'), this.keyLength);
  }

  /**
   * Store connection configuration with encrypted credentials
   */
  storeConnection(config: ITSMConnectionConfig): string {
    const connectionId = this.generateConnectionId();
    const encryptedCredentials = this.encryptCredentials(config.credentials);

    const storedConnection: StoredConnection = {
      id: connectionId,
      name: config.name,
      type: config.type,
      baseUrl: config.baseUrl,
      encryptedCredentials,
      config: {
        id: config.id,
        name: config.name,
        type: config.type,
        baseUrl: config.baseUrl,
        enabled: config.enabled,
        defaultPriority: config.defaultPriority,
        defaultCategory: config.defaultCategory,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        syncIntervalMs: config.syncIntervalMs,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        lastTestedAt: config.lastTestedAt,
        lastTestStatus: config.lastTestStatus,
        lastTestError: config.lastTestError
      } as any,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.storage.set(connectionId, storedConnection);
    return connectionId;
  }

  /**
   * Retrieve connection configuration with decrypted credentials
   */
  retrieveConnection(connectionId: string): ITSMConnectionConfig | null {
    const storedConnection = this.storage.get(connectionId);
    if (!storedConnection) {
      return null;
    }

    try {
      const credentials = this.decryptCredentials(storedConnection.encryptedCredentials);

      // Update last used timestamp
      storedConnection.lastUsed = Date.now();
      this.storage.set(connectionId, storedConnection);

      return {
        ...storedConnection.config,
        credentials,
        id: storedConnection.config.id || connectionId
      };
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return null;
    }
  }

  /**
   * Update connection configuration
   */
  updateConnection(connectionId: string, updates: Partial<ITSMConnectionConfig>): boolean {
    const storedConnection = this.storage.get(connectionId);
    if (!storedConnection) {
      return false;
    }

    // If credentials are being updated, re-encrypt them
    if (updates.credentials) {
      storedConnection.encryptedCredentials = this.encryptCredentials(updates.credentials);
    }

    // Update other config fields (excluding credentials which are handled separately)
    const { credentials: _, ...updatesWithoutCredentials } = updates;
    storedConnection.config = {
      ...storedConnection.config,
      ...updatesWithoutCredentials
    };

    storedConnection.updatedAt = Date.now();
    this.storage.set(connectionId, storedConnection);

    return true;
  }

  /**
   * Delete connection configuration
   */
  deleteConnection(connectionId: string): boolean {
    return this.storage.delete(connectionId);
  }

  /**
   * List all stored connections
   */
  listConnections(): Array<{
    id: string;
    name: string;
    type: string;
    baseUrl: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
    lastUsed?: number;
  }> {
    return Array.from(this.storage.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      baseUrl: conn.baseUrl,
      enabled: conn.config.enabled,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
      lastUsed: conn.lastUsed
    }));
  }

  /**
   * Rotate encryption key (should be called periodically)
   */
  rotateKey(newMasterKey: string): void {
    // Re-encrypt all credentials with new key
    const newEncryptionKey = scryptSync(newMasterKey, Buffer.from('itsm-credential-salt'), this.keyLength);

    for (const [connectionId, storedConnection] of Array.from(this.storage.entries())) {
      try {
        const credentials = this.decryptCredentials(storedConnection.encryptedCredentials);
        storedConnection.encryptedCredentials = this.encryptCredentialsWithKey(credentials, newEncryptionKey);
        this.storage.set(connectionId, storedConnection);
      } catch (error) {
        console.error(`Failed to rotate key for connection ${connectionId}:`, error);
      }
    }

    this.encryptionKey = newEncryptionKey;
  }

  /**
   * Validate connection configuration
   */
  validateConnection(config: ITSMConnectionConfig): string[] {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Connection name is required');
    }

    if (!config.baseUrl) {
      errors.push('Base URL is required');
    }

    try {
      new URL(config.baseUrl);
    } catch {
      errors.push('Base URL must be a valid URL');
    }

    if (!config.credentials) {
      errors.push('Credentials are required');
    } else {
      errors.push(...this.validateCredentials(config.credentials, config.type));
    }

    return errors;
  }

  /**
   * Export connections for backup (encrypted)
   */
  exportConnections(): string {
    const connections = Array.from(this.storage.values());
    return JSON.stringify({
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      connections
    }, null, 2);
  }

  /**
   * Import connections from backup
   */
  importConnections(exportData: string): number {
    try {
      const data = JSON.parse(exportData);

      if (data.version !== '1.0.0') {
        throw new Error('Unsupported export version');
      }

      let importedCount = 0;
      for (const connection of data.connections) {
        if (this.validateStoredConnection(connection)) {
          this.storage.set(connection.id, connection);
          importedCount++;
        }
      }

      return importedCount;
    } catch (error) {
      console.error('Failed to import connections:', error);
      return 0;
    }
  }

  /**
   * Clean up old connections
   */
  cleanupOldConnections(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number { // 30 days
    const cutoffTime = Date.now() - maxAgeMs;
    let removedCount = 0;

    for (const [connectionId, connection] of Array.from(this.storage.entries())) {
      if (connection.lastUsed && connection.lastUsed < cutoffTime) {
        this.storage.delete(connectionId);
        removedCount++;
      }
    }

    return removedCount;
  }

  private encryptCredentials(credentials: ITSMCredentials): EncryptedCredential {
    return this.encryptCredentialsWithKey(credentials, this.encryptionKey);
  }

  private encryptCredentialsWithKey(credentials: ITSMCredentials, key: Buffer): EncryptedCredential {
    const iv = randomBytes(12); // 96-bit IV for AES-GCM
    const salt = randomBytes(16); // Unique salt for each encryption

    // Derive encryption key using unique salt
    const derivedKey = this.deriveKey(key.toString('hex'), salt);

    // Use AES-GCM for authenticated encryption
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      salt: salt.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: 'aes-256-gcm',
      version: '2.0.0' // Version bump for new encryption format
    };
  }

  private decryptCredentials(encryptedCredential: EncryptedCredential): ITSMCredentials {
    const iv = Buffer.from(encryptedCredential.iv, 'base64');
    const encryptedData = Buffer.from(encryptedCredential.encryptedData, 'base64');
    const salt = Buffer.from(encryptedCredential.salt, 'base64');
    const authTag = Buffer.from(encryptedCredential.authTag, 'base64');

    // Handle backward compatibility with v1.0.0 format
    if (encryptedCredential.version === '1.0.0' || encryptedCredential.algorithm === 'aes-256-cbc') {
      // Legacy CBC mode decryption
      const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
      return JSON.parse(decrypted.toString('utf8'));
    }

    // AES-GCM mode decryption
    const derivedKey = this.deriveKey(this.encryptionKey.toString('hex'), salt);
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  private deriveKey(masterKey: string, salt: Buffer): Buffer {
    return scryptSync(masterKey, salt, this.keyLength);
  }

  private generateConnectionId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `conn_${timestamp}_${random}`;
  }

  private validateCredentials(credentials: ITSMCredentials, type: string): string[] {
    const errors: string[] = [];

    switch (type) {
      case 'servicenow':
        if (!credentials.username) {
          errors.push('ServiceNow requires username');
        }
        if (!credentials.password) {
          errors.push('ServiceNow requires password');
        }
        break;

      case 'jira':
        if (!credentials.username) {
          errors.push('Jira requires email address');
        }
        if (!credentials.apiToken) {
          errors.push('Jira requires API token');
        }
        break;

      case 'zendesk':
        if (!credentials.username) {
          errors.push('Zendesk requires email address');
        }
        if (!credentials.apiToken) {
          errors.push('Zendesk requires API token');
        }
        break;

      case 'salesforce':
        if (!credentials.username) {
          errors.push('Salesforce requires username');
        }
        if (!credentials.password) {
          errors.push('Salesforce requires password');
        }
        if (!credentials.clientId) {
          errors.push('Salesforce requires client ID');
        }
        if (!credentials.clientSecret) {
          errors.push('Salesforce requires client secret');
        }
        break;

      default:
        errors.push(`Unsupported ITSM type: ${type}`);
    }

    return errors;
  }

  private validateStoredConnection(connection: any): connection is StoredConnection {
    return (
      connection &&
      typeof connection.id === 'string' &&
      typeof connection.name === 'string' &&
      typeof connection.type === 'string' &&
      typeof connection.baseUrl === 'string' &&
      connection.encryptedCredentials &&
      typeof connection.encryptedCredentials.encryptedData === 'string' &&
      typeof connection.encryptedCredentials.iv === 'string' &&
      typeof connection.encryptedCredentials.authTag === 'string' &&
      connection.config &&
      typeof connection.createdAt === 'number'
    );
  }
}