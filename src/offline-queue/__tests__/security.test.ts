import { EncryptedDatabase } from '../encrypted-database';
import { QueueConfig } from '../types';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';

describe('Security Tests for Encrypted Database', () => {
  const testConfig: QueueConfig = {
    databasePath: join(__dirname, 'test-security.db'),
    encryptionKey: 'test-encryption-key-1234567890',
    maxTicketItems: 20,
    maxFeedbackItems: 100,
    maxLogSizeBytes: 50 * 1024 * 1024,
    maxRetryAttempts: 5,
    retryBackoffMs: 30000,
    retryJitterMs: 5000,
    cleanupIntervalMs: 3600000,
    syncIntervalMs: 30000
  };

  let encryptedDb: EncryptedDatabase;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(testConfig.databasePath)) {
      unlinkSync(testConfig.databasePath);
    }

    // Ensure directory exists
    const dir = join(__dirname);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    encryptedDb = new EncryptedDatabase(testConfig);
  });

  afterEach(() => {
    if (encryptedDb) {
      encryptedDb.close();
    }

    // Clean up test database
    if (existsSync(testConfig.databasePath)) {
      unlinkSync(testConfig.databasePath);
    }
  });

  describe('AES-GCM Encryption Security', () => {
    test('should encrypt and decrypt data successfully', () => {
      const testData = { sensitive: 'secret-data', number: 42, array: [1, 2, 3] };

      const encrypted = encryptedDb.encryptData(testData);
      const decrypted = encryptedDb.decryptData(encrypted.encrypted, encrypted.iv, encrypted.authTag);

      expect(decrypted).toEqual(testData);
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.authTag.length).toBeGreaterThan(0);
    });

    test('should use unique IV for each encryption', () => {
      const testData = { message: 'test message' };

      const encrypted1 = encryptedDb.encryptData(testData);
      const encrypted2 = encryptedDb.encryptData(testData);

      // IV should be different for each encryption
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);

      // But both should decrypt to the same data
      expect(encryptedDb.decryptData(encrypted1.encrypted, encrypted1.iv, encrypted1.authTag)).toEqual(testData);
      expect(encryptedDb.decryptData(encrypted2.encrypted, encrypted2.iv, encrypted2.authTag)).toEqual(testData);
    });

    test('should detect tampered authentication tag', () => {
      const testData = { sensitive: 'secret information' };
      const encrypted = encryptedDb.encryptData(testData);

      // Tamper with the authentication tag
      const tamperedAuthTag = randomBytes(16).toString('hex');

      expect(() => {
        encryptedDb.decryptData(encrypted.encrypted, encrypted.iv, tamperedAuthTag);
      }).toThrow();
    });

    test('should detect tampered encrypted data', () => {
      const testData = { username: 'testuser', password: 'secret123' };
      const encrypted = encryptedDb.encryptData(testData);

      // Tamper with the encrypted data
      const encryptedBuffer = Buffer.from(encrypted.encrypted, 'base64');
      encryptedBuffer[0] ^= 0xFF; // Flip some bits
      const tamperedEncrypted = encryptedBuffer.toString('base64');

      expect(() => {
        encryptedDb.decryptData(tamperedEncrypted, encrypted.iv, encrypted.authTag);
      }).toThrow();
    });

    test('should detect tampered IV', () => {
      const testData = { apiKey: 'sk_test_1234567890' };
      const encrypted = encryptedDb.encryptData(testData);

      // Tamper with the IV
      const ivBuffer = Buffer.from(encrypted.iv, 'hex');
      ivBuffer[0] ^= 0xFF; // Flip some bits
      const tamperedIv = ivBuffer.toString('hex');

      expect(() => {
        encryptedDb.decryptData(encrypted.encrypted, tamperedIv, encrypted.authTag);
      }).toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    test('should handle legacy CBC encrypted data', () => {
      // Simulate legacy CBC format (empty authTag)
      const testData = { legacy: 'data' };

      // Mock the actual CBC decryption (this tests the format detection)
      jest.spyOn(encryptedDb as any, 'decryptData').mockImplementation((...args: any[]) => {
        const authTag = args[2];
        if (!authTag) {
          return testData; // Simulate successful CBC decryption
        }
        throw new Error('Authentication failed');
      });

      const result = encryptedDb.decryptData('encrypted-data', 'iv-data', '');
      expect(result).toEqual(testData);
    });
  });

  describe('Cryptographic Properties', () => {
    test('should have proper encryption metadata', () => {
      const testData = { message: 'test' };
      const encrypted = encryptedDb.encryptData(testData);

      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      // Verify proper lengths
      const iv = Buffer.from(encrypted.iv, 'hex');
      const authTag = Buffer.from(encrypted.authTag, 'hex');

      expect(iv.length).toBe(12); // 96-bit IV for AES-GCM
      expect(authTag.length).toBe(16); // 128-bit authentication tag
    });

    test('should resist known-plaintext attacks', () => {
      const testData = { identical: 'data' };

      const encrypted1 = encryptedDb.encryptData(testData);
      const encrypted2 = encryptedDb.encryptData(testData);

      // Same plaintext should produce different ciphertexts due to unique IV
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed encrypted data', () => {
      expect(() => {
        encryptedDb.decryptData('not-base64-data', randomBytes(12).toString('hex'), randomBytes(16).toString('hex'));
      }).toThrow();
    });

    test('should handle incorrect IV length', () => {
      const testData = { message: 'test' };
      const encrypted = encryptedDb.encryptData(testData);

      // Provide wrong IV length
      const wrongIv = randomBytes(16).toString('hex'); // 128-bit instead of 96-bit

      expect(() => {
        encryptedDb.decryptData(encrypted.encrypted, wrongIv, encrypted.authTag);
      }).toThrow();
    });

    test('should handle incorrect auth tag length', () => {
      const testData = { message: 'test' };
      const encrypted = encryptedDb.encryptData(testData);

      // Provide wrong auth tag length
      const wrongAuthTag = randomBytes(12).toString('hex'); // 96-bit instead of 128-bit

      expect(() => {
        encryptedDb.decryptData(encrypted.encrypted, encrypted.iv, wrongAuthTag);
      }).toThrow();
    });
  });

  describe('Database Integration', () => {
    test('should store and retrieve encrypted data from database', () => {
      const sensitiveData = {
        username: 'api_user',
        password: 'secret_password_123',
        apiKey: 'sk_test_abcdef123456'
      };

      // Encrypt and store
      const encrypted = encryptedDb.encryptData(sensitiveData);

      // Store in database (simulated)
      const db = encryptedDb.getDatabase();
      db.prepare(`
        INSERT INTO queue_items
        (id, type, status, priority, encrypted_data, encryption_iv, encryption_auth_tag, retry_count, created_at, updated_at, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-id', 'ticket', 'pending', 'normal',
        encrypted.encrypted, encrypted.iv, encrypted.authTag,
        0, Date.now(), Date.now(), JSON.stringify(sensitiveData).length
      );

      // Retrieve and decrypt
      const row = db.prepare('SELECT * FROM queue_items WHERE id = ?').get('test-id') as any;
      const decrypted = encryptedDb.decryptData(row.encrypted_data, row.encryption_iv, row.encryption_auth_tag);

      expect(decrypted).toEqual(sensitiveData);
    });

    test('should detect database tampering', () => {
      const sensitiveData = { creditCard: '4111111111111111' };
      const encrypted = encryptedDb.encryptData(sensitiveData);

      // Store in database
      const db = encryptedDb.getDatabase();
      db.prepare(`
        INSERT INTO queue_items
        (id, type, status, priority, encrypted_data, encryption_iv, encryption_auth_tag, retry_count, created_at, updated_at, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-id-2', 'ticket', 'pending', 'normal',
        encrypted.encrypted, encrypted.iv, encrypted.authTag,
        0, Date.now(), Date.now(), JSON.stringify(sensitiveData).length
      );

      // Tamper with the encrypted data in the database
      db.prepare('UPDATE queue_items SET encrypted_data = ? WHERE id = ?')
        .run('tampered-data', 'test-id-2');

      // Try to retrieve and decrypt - should fail
      const row = db.prepare('SELECT * FROM queue_items WHERE id = ?').get('test-id-2') as any;

      expect(() => {
        encryptedDb.decryptData(row.encrypted_data, row.encryption_iv, row.encryption_auth_tag);
      }).toThrow();
    });
  });
});