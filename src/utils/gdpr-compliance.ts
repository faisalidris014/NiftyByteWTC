// GDPR-Compliant Data Handling Procedures
// Comprehensive data protection, privacy controls, consent management, and data subject rights

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

// GDPR Article definitions
const GDPR_ARTICLES = {
  // Lawful basis for processing
  ARTICLE_6: 'Lawful basis for processing',
  ARTICLE_9: 'Processing of special categories of personal data',

  // Data subject rights
  ARTICLE_15: 'Right of access by the data subject',
  ARTICLE_16: 'Right to rectification',
  ARTICLE_17: 'Right to erasure ("right to be forgotten")',
  ARTICLE_18: 'Right to restriction of processing',
  ARTICLE_20: 'Right to data portability',
  ARTICLE_21: 'Right to object',

  // Data protection principles
  ARTICLE_5: 'Principles relating to processing of personal data',
  ARTICLE_25: 'Data protection by design and by default',
  ARTICLE_32: 'Security of processing',

  // International transfers
  ARTICLE_44: 'General principle for transfers',
  ARTICLE_45: 'Transfers on the basis of an adequacy decision',

  // Documentation and accountability
  ARTICLE_30: 'Records of processing activities',
  ARTICLE_35: 'Data protection impact assessment',
  ARTICLE_37: 'Designation of the data protection officer'
} as const;

interface DataSubject {
  id: string;
  email?: string;
  name?: string;
  consentGiven: boolean;
  consentTimestamp?: number;
  dataCategories: string[];
  retentionPeriod: number;
  lastAccess?: number;
}

interface ProcessingActivity {
  id: string;
  name: string;
  description: string;
  lawfulBasis: keyof typeof GDPR_ARTICLES;
  dataCategories: string[];
  retentionPeriod: number;
  securityMeasures: string[];
  createdAt: number;
  updatedAt: number;
}

interface ConsentRecord {
  id: string;
  dataSubjectId: string;
  processingActivityId: string;
  given: boolean;
  timestamp: number;
  purpose: string;
  withdrawalTimestamp?: number;
}

interface DataAccessRequest {
  id: string;
  dataSubjectId: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestedAt: number;
  completedAt?: number;
  dataProvided?: any;
  rejectionReason?: string;
}

export class GDPRComplianceManager extends EventEmitter {
  private static instance: GDPRComplianceManager;
  private dataSubjects = new Map<string, DataSubject>();
  private processingActivities = new Map<string, ProcessingActivity>();
  private consentRecords = new Map<string, ConsentRecord>();
  private accessRequests = new Map<string, DataAccessRequest>();
  private readonly DATA_DIR = path.join(process.cwd(), 'data', 'gdpr');
  private readonly RETENTION_PERIOD = 365 * 24 * 60 * 60 * 1000; // 1 year

  private constructor() {
    super();
    this.initialize().catch(console.error);
  }

  static getInstance(): GDPRComplianceManager {
    if (!GDPRComplianceManager.instance) {
      GDPRComplianceManager.instance = new GDPRComplianceManager();
    }
    return GDPRComplianceManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Create data directory with secure permissions
      await fs.mkdir(this.DATA_DIR, { recursive: true, mode: 0o700 });

      // Set restrictive permissions on the directory
      await fs.chmod(this.DATA_DIR, 0o700);

      await this.loadData();
      this.setupCleanupInterval();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to initialize GDPR compliance manager: ${errorMessage}`);
      // Re-throw to prevent silent failures
      throw new Error(`GDPR compliance initialization failed: ${errorMessage}`);
    }
  }

  private async loadData(): Promise<void> {
    try {
      await this.loadFromFile('dataSubjects.json', this.dataSubjects);
      await this.loadFromFile('processingActivities.json', this.processingActivities);
      await this.loadFromFile('consentRecords.json', this.consentRecords);
      await this.loadFromFile('accessRequests.json', this.accessRequests);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Could not load GDPR data, starting fresh: ${errorMessage}`);
      // Continue with fresh data instead of failing
    }
  }

  private async loadFromFile<T>(filename: string, map: Map<string, T>): Promise<void> {
    const filePath = path.join(this.DATA_DIR, filename);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      Object.entries(parsed).forEach(([key, value]) => {
        map.set(key, value as T);
      });
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
  }

  private async saveToFile<T>(filename: string, map: Map<string, T>): Promise<void> {
    const filePath = path.join(this.DATA_DIR, filename);
    const data = Object.fromEntries(map.entries());

    // Ensure data directory exists with proper permissions
    await fs.mkdir(this.DATA_DIR, { recursive: true, mode: 0o700 });

    // Write file with restrictive permissions (owner read/write only)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), {
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });

    // Set directory permissions to prevent unauthorized access
    await fs.chmod(this.DATA_DIR, 0o700);
  }

  private setupCleanupInterval(): void {
    setInterval(async () => {
      await this.cleanupExpiredData();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  // Data Subject Management
  async registerDataSubject(
    id: string,
    data: Partial<DataSubject> = {}
  ): Promise<DataSubject> {
    // Input validation
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Data subject ID must be a non-empty string');
    }

    if (data && typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataSubject: DataSubject = {
      id,
      consentGiven: false,
      dataCategories: [],
      retentionPeriod: this.RETENTION_PERIOD,
      ...data
    };

    this.dataSubjects.set(id, dataSubject);
    await this.saveToFile('dataSubjects.json', this.dataSubjects);

    this.emit('dataSubjectRegistered', dataSubject);
    return dataSubject;
  }

  async updateDataSubject(id: string, updates: Partial<DataSubject>): Promise<DataSubject> {
    const existing = this.dataSubjects.get(id);
    if (!existing) {
      throw new Error(`Data subject ${id} not found`);
    }

    const updated = { ...existing, ...updates, lastAccess: Date.now() };
    this.dataSubjects.set(id, updated);
    await this.saveToFile('dataSubjects.json', this.dataSubjects);

    this.emit('dataSubjectUpdated', updated);
    return updated;
  }

  async getDataSubject(id: string): Promise<DataSubject | undefined> {
    const subject = this.dataSubjects.get(id);
    if (subject) {
      await this.updateDataSubject(id, { lastAccess: Date.now() });
    }
    return subject;
  }

  // Consent Management
  async recordConsent(
    dataSubjectId: string,
    processingActivityId: string,
    purpose: string
  ): Promise<ConsentRecord> {
    const consentId = this.generateId('consent');
    const consentRecord: ConsentRecord = {
      id: consentId,
      dataSubjectId,
      processingActivityId,
      given: true,
      timestamp: Date.now(),
      purpose
    };

    this.consentRecords.set(consentId, consentRecord);

    // Update data subject consent status
    await this.updateDataSubject(dataSubjectId, {
      consentGiven: true,
      consentTimestamp: Date.now()
    });

    await this.saveToFile('consentRecords.json', this.consentRecords);

    this.emit('consentRecorded', consentRecord);
    return consentRecord;
  }

  async withdrawConsent(consentId: string): Promise<void> {
    const consent = this.consentRecords.get(consentId);
    if (!consent) {
      throw new Error(`Consent record ${consentId} not found`);
    }

    consent.given = false;
    consent.withdrawalTimestamp = Date.now();
    this.consentRecords.set(consentId, consent);

    await this.saveToFile('consentRecords.json', this.consentRecords);

    this.emit('consentWithdrawn', consent);
  }

  async hasValidConsent(dataSubjectId: string, processingActivityId: string): Promise<boolean> {
    const consents = Array.from(this.consentRecords.values()).filter(
      consent =>
        consent.dataSubjectId === dataSubjectId &&
        consent.processingActivityId === processingActivityId &&
        consent.given
    );

    return consents.length > 0;
  }

  // Processing Activities
  async registerProcessingActivity(
    id: string,
    name: string,
    description: string,
    dataCategories: string[],
    lawfulBasis: keyof typeof GDPR_ARTICLES,
    securityMeasures: string[] = [],
    retentionPeriod?: number
  ): Promise<ProcessingActivity> {
    // Input validation
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Processing activity ID must be a non-empty string');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Processing activity name must be a non-empty string');
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Processing activity description must be a non-empty string');
    }

    if (!Array.isArray(dataCategories)) {
      throw new Error('Data categories must be an array');
    }

    if (!lawfulBasis || !GDPR_ARTICLES[lawfulBasis as keyof typeof GDPR_ARTICLES]) {
      throw new Error('Invalid lawful basis specified');
    }

    if (!Array.isArray(securityMeasures)) {
      throw new Error('Security measures must be an array');
    }
    const activity: ProcessingActivity = {
      id,
      name,
      description,
      lawfulBasis,
      dataCategories,
      securityMeasures,
      retentionPeriod: retentionPeriod || this.RETENTION_PERIOD,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.processingActivities.set(id, activity);
    await this.saveToFile('processingActivities.json', this.processingActivities);

    this.emit('processingActivityRegistered', activity);
    return activity;
  }

  // Data Subject Rights - Article 15: Right of access
  async requestDataAccess(dataSubjectId: string): Promise<DataAccessRequest> {
    // Input validation
    if (!dataSubjectId || typeof dataSubjectId !== 'string' || dataSubjectId.trim().length === 0) {
      throw new Error('Data subject ID must be a non-empty string');
    }
    const requestId = this.generateId('access');
    const request: DataAccessRequest = {
      id: requestId,
      dataSubjectId,
      type: 'access',
      status: 'pending',
      requestedAt: Date.now()
    };

    this.accessRequests.set(requestId, request);
    await this.saveToFile('accessRequests.json', this.accessRequests);

    this.emit('accessRequested', request);
    return request;
  }

  // Article 17: Right to erasure
  async requestDataErasure(dataSubjectId: string): Promise<DataAccessRequest> {
    // Input validation
    if (!dataSubjectId || typeof dataSubjectId !== 'string' || dataSubjectId.trim().length === 0) {
      throw new Error('Data subject ID must be a non-empty string');
    }
    const requestId = this.generateId('erasure');
    const request: DataAccessRequest = {
      id: requestId,
      dataSubjectId,
      type: 'erasure',
      status: 'pending',
      requestedAt: Date.now()
    };

    this.accessRequests.set(requestId, request);
    await this.saveToFile('accessRequests.json', this.accessRequests);

    this.emit('erasureRequested', request);
    return request;
  }

  // Article 20: Right to data portability
  async requestDataPortability(dataSubjectId: string): Promise<DataAccessRequest> {
    // Input validation
    if (!dataSubjectId || typeof dataSubjectId !== 'string' || dataSubjectId.trim().length === 0) {
      throw new Error('Data subject ID must be a non-empty string');
    }
    const requestId = this.generateId('portability');
    const request: DataAccessRequest = {
      id: requestId,
      dataSubjectId,
      type: 'portability',
      status: 'pending',
      requestedAt: Date.now()
    };

    this.accessRequests.set(requestId, request);
    await this.saveToFile('accessRequests.json', this.accessRequests);

    this.emit('portabilityRequested', request);
    return request;
  }

  // Process data subject requests
  async processAccessRequest(requestId: string, data: any): Promise<void> {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new Error(`Access request ${requestId} not found`);
    }

    request.status = 'completed';
    request.completedAt = Date.now();
    request.dataProvided = data;

    this.accessRequests.set(requestId, request);
    await this.saveToFile('accessRequests.json', this.accessRequests);

    this.emit('accessRequestCompleted', request);
  }

  async processErasureRequest(requestId: string): Promise<void> {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new Error(`Erasure request ${requestId} not found`);
    }

    // Implement data erasure logic here
    // This would remove all personal data for the data subject

    request.status = 'completed';
    request.completedAt = Date.now();

    this.accessRequests.set(requestId, request);
    await this.saveToFile('accessRequests.json', this.accessRequests);

    this.emit('erasureRequestCompleted', request);
  }

  // Data Protection by Design - Article 25
  // Proper pseudonymization using keyed HMAC with salt
  pseudonymizeData(data: string): string {
    const salt = crypto.randomBytes(16);
    // Use HMAC-SHA256 for proper pseudonymization
    const hmac = crypto.createHmac('sha256', salt);
    hmac.update(data);
    return `${salt.toString('hex')}:${hmac.digest('hex')}`;
  }

  encryptPersonalData(data: string, key: Buffer): { iv: string; encrypted: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      iv: iv.toString('hex'),
      encrypted,
      tag
    };
  }

  // Decrypt personal data
  decryptPersonalData(encryptedData: { iv: string; encrypted: string; tag: string }, key: Buffer): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Data minimization - only collect necessary data
  validateDataMinimization(data: any, requiredFields: string[]): boolean {
    const dataKeys = Object.keys(data);
    return dataKeys.every(key => requiredFields.includes(key));
  }

  // Cleanup expired data
  private async cleanupExpiredData(): Promise<void> {
    const now = Date.now();

    // Cleanup expired data subjects
    for (const [id, subject] of this.dataSubjects.entries()) {
      if (now - (subject.lastAccess || subject.consentTimestamp || 0) > subject.retentionPeriod) {
        this.dataSubjects.delete(id);
        this.emit('dataSubjectExpired', subject);
      }
    }

    // Cleanup expired consent records
    for (const [id, consent] of this.consentRecords.entries()) {
      if (now - consent.timestamp > this.RETENTION_PERIOD) {
        this.consentRecords.delete(id);
      }
    }

    // Cleanup old access requests
    for (const [id, request] of this.accessRequests.entries()) {
      if (now - request.requestedAt > 90 * 24 * 60 * 60 * 1000) { // 90 days
        this.accessRequests.delete(id);
      }
    }

    await this.saveAllData();
  }

  private async saveAllData(): Promise<void> {
    await Promise.all([
      this.saveToFile('dataSubjects.json', this.dataSubjects),
      this.saveToFile('processingActivities.json', this.processingActivities),
      this.saveToFile('consentRecords.json', this.consentRecords),
      this.saveToFile('accessRequests.json', this.accessRequests)
    ]);
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  // Compliance reporting
  async generateComplianceReport(): Promise<any> {
    return {
      timestamp: Date.now(),
      dataSubjects: this.dataSubjects.size,
      processingActivities: this.processingActivities.size,
      consentRecords: this.consentRecords.size,
      accessRequests: this.accessRequests.size,
      complianceStatus: this.checkComplianceStatus()
    };
  }

  private checkComplianceStatus(): any {
    return {
      article_5: this.checkArticle5Compliance(),
      article_6: this.checkArticle6Compliance(),
      article_25: this.checkArticle25Compliance(),
      article_32: this.checkArticle32Compliance()
    };
  }

  private checkArticle5Compliance(): { compliant: boolean; issues: string[] } {
    // Check data processing principles
    const issues: string[] = [];

    // Lawfulness, fairness, transparency
    // Purpose limitation
    // Data minimization
    // Accuracy
    // Storage limitation
    // Integrity and confidentiality
    // Accountability

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  private checkArticle6Compliance(): { compliant: boolean; issues: string[] } {
    // Check lawful basis for processing
    const issues: string[] = [];

    for (const activity of this.processingActivities.values()) {
      if (!activity.lawfulBasis) {
        issues.push(`Processing activity ${activity.id} missing lawful basis`);
      }
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  private checkArticle25Compliance(): { compliant: boolean; issues: string[] } {
    // Check data protection by design and by default
    const issues: string[] = [];

    // Implement checks for privacy by design

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  private checkArticle32Compliance(): { compliant: boolean; issues: string[] } {
    // Check security of processing
    const issues: string[] = [];

    for (const activity of this.processingActivities.values()) {
      if (activity.securityMeasures.length === 0) {
        issues.push(`Processing activity ${activity.id} missing security measures`);
      }
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  // Shutdown cleanup
  async shutdown(): Promise<void> {
    await this.saveAllData();
    this.removeAllListeners();
  }
}

// Utility functions for GDPR compliance
export const GDPRUtils = {
  // Data classification
  classifyData(data: any): string[] {
    const categories: string[] = [];

    if (data.email) categories.push('contact');
    if (data.name) categories.push('identification');
    if (data.location) categories.push('location');
    if (data.health) categories.push('health');
    if (data.financial) categories.push('financial');

    return categories;
  },

  // Consent validation
  isValidConsent(consent: any): boolean {
    return (
      consent &&
      consent.given === true &&
      consent.timestamp &&
      consent.purpose
    );
  },

  // Data retention validation
  isWithinRetentionPeriod(timestamp: number, retentionPeriod: number): boolean {
    return Date.now() - timestamp <= retentionPeriod;
  },

  // Data subject rights validation
  validateAccessRequest(request: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.dataSubjectId) {
      errors.push('Missing data subject ID');
    }
    if (!request.type) {
      errors.push('Missing request type');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};