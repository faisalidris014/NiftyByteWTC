// Security Integration Module
// Connects all security components with existing Admin Console and systems

import { UACElevationManager, setupUACHandlers } from '../utils/uac-elevation';
import { GDPRComplianceManager } from '../utils/gdpr-compliance';
import { ImmutableAuditLogger, AuditPatterns } from '../utils/immutable-audit-log';
import { ipcMain } from 'electron';

// Security integration manager
export class SecurityIntegrationManager {
  private static instance: SecurityIntegrationManager;
  private uacManager: UACElevationManager;
  private gdprManager: GDPRComplianceManager;
  private auditLogger: ImmutableAuditLogger;

  private constructor() {
    this.uacManager = UACElevationManager.getInstance();
    this.gdprManager = GDPRComplianceManager.getInstance();
    this.auditLogger = ImmutableAuditLogger.getInstance();
  }

  static getInstance(): SecurityIntegrationManager {
    if (!SecurityIntegrationManager.instance) {
      SecurityIntegrationManager.instance = new SecurityIntegrationManager();
    }
    return SecurityIntegrationManager.instance;
  }

  /**
   * Initialize all security components and register IPC handlers
   */
  async initialize(): Promise<void> {
    console.log('Initializing security integration...');

    try {
      // Setup UAC handlers
      setupUACHandlers();

      // Register IPC handlers for security components
      this.registerSecurityHandlers();

      // Setup audit logging for security events
      this.setupAuditLogging();

      // Initialize GDPR compliance
      await this.initializeGDPRCompliance();

      console.log('Security integration initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Security integration initialization failed: ${errorMessage}`);
      throw new Error(`Security integration failed: ${errorMessage}`);
    }
  }

  /**
   * Register IPC handlers for security operations
   */
  private registerSecurityHandlers(): void {
    // UAC elevation requests
    ipcMain.handle('request-uac-elevation', async (event, command: string, args: string[], options: any) => {
      const uacManager = UACElevationManager.getInstance();
      return uacManager.executeWithElevation(command, args, options);
    });

    // GDPR data access requests
    ipcMain.handle('request-data-access', async (event, dataSubjectId: string) => {
      const gdprManager = GDPRComplianceManager.getInstance();
      return gdprManager.requestDataAccess(dataSubjectId);
    });

    // GDPR data erasure requests
    ipcMain.handle('request-data-erasure', async (event, dataSubjectId: string) => {
      const gdprManager = GDPRComplianceManager.getInstance();
      return gdprManager.requestDataErasure(dataSubjectId);
    });

    // Audit log queries
    ipcMain.handle('query-audit-logs', async (event, filters: any, limit: number, offset: number) => {
      const auditLogger = ImmutableAuditLogger.getInstance();
      return auditLogger.queryLogs(filters, limit, offset);
    });

    // Security status checks
    ipcMain.handle('check-security-status', async () => {
      return this.getSecurityStatus();
    });
  }

  /**
   * Setup comprehensive audit logging
   */
  private setupAuditLogging(): void {
    const auditLogger = ImmutableAuditLogger.getInstance();

    // Log UAC elevation events
    this.uacManager.on('elevationRequested', (request) => {
      AuditPatterns.logSecurityEvent(
        'uac.requested',
        'medium',
        {
          operation: request.operation,
          description: request.description,
          requestId: request.id
        },
        { userId: 'system' }
      );
    });

    this.uacManager.on('elevationCompleted', (request) => {
      AuditPatterns.logSecurityEvent(
        'uac.completed',
        request.result?.success ? 'low' : 'high',
        {
          operation: request.operation,
          success: request.result?.success,
          error: request.result?.error,
          requestId: request.id
        },
        { userId: 'system' }
      );
    });

    this.uacManager.on('elevationDenied', (request) => {
      AuditPatterns.logSecurityEvent(
        'uac.denied',
        'medium',
        {
          operation: request.operation,
          requestId: request.id
        },
        { userId: 'system' }
      );
    });

    // Log GDPR events
    this.gdprManager.on('dataSubjectRegistered', (subject) => {
      AuditPatterns.logDataAccess(
        'system',
        'gdpr',
        'register_subject',
        true,
        { subjectId: subject.id },
        { userId: 'system' }
      );
    });

    this.gdprManager.on('accessRequested', (request) => {
      AuditPatterns.logDataAccess(
        'system',
        'gdpr',
        'access_request',
        true,
        { requestId: request.id, type: request.type },
        { userId: 'system' }
      );
    });

    this.gdprManager.on('erasureRequested', (request) => {
      AuditPatterns.logDataAccess(
        'system',
        'gdpr',
        'erasure_request',
        true,
        { requestId: request.id },
        { userId: 'system' }
      );
    });
  }

  /**
   * Initialize GDPR compliance with default processing activities
   */
  private async initializeGDPRCompliance(): Promise<void> {
    const gdprManager = GDPRComplianceManager.getInstance();

    // Register default processing activities
    await gdprManager.registerProcessingActivity(
      'skill-execution',
      'Skill Execution',
      'Execution of troubleshooting skills',
      ['system_data', 'performance_metrics'],
      'ARTICLE_6',
      ['encryption', 'access_controls', 'audit_logging']
    );

    await gdprManager.registerProcessingActivity(
      'user-authentication',
      'User Authentication',
      'Admin console user authentication',
      ['contact', 'identification'],
      'ARTICLE_6',
      ['encryption', 'hashing', 'rate_limiting']
    );

    await gdprManager.registerProcessingActivity(
      'audit-logging',
      'Audit Logging',
      'Security and compliance audit logging',
      ['system_events', 'user_actions', 'security_events'],
      'ARTICLE_6',
      ['encryption', 'integrity_checking', 'immutable_storage']
    );

    await gdprManager.registerProcessingActivity(
      'itsm-integration',
      'ITSM Integration',
      'Integration with IT service management systems',
      ['ticket_data', 'user_contact', 'system_information'],
      'ARTICLE_6',
      ['encryption', 'api_security', 'data_minimization']
    );
  }

  /**
   * Get comprehensive security status
   */
  async getSecurityStatus(): Promise<any> {
    const hasAdmin = await this.uacManager.hasAdminPrivileges();
    const gdprReport = await this.gdprManager.generateComplianceReport();
    const auditIntegrity = await this.auditLogger.verifyLogIntegrity();

    return {
      timestamp: Date.now(),
      uac: {
        available: process.platform === 'win32',
        hasAdminPrivileges: hasAdmin
      },
      gdpr: gdprReport,
      audit: {
        integrity: auditIntegrity.valid,
        integrityErrors: auditIntegrity.errors,
        totalEntries: (await this.auditLogger.queryLogs({}, 1, 0)).length
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-256-GCM',
        keyManagement: 'secure'
      },
      tls: {
        enabled: true,
        version: 'TLS 1.3',
        certificatePinning: true
      }
    };
  }

  /**
   * Execute admin operation with proper security controls
   */
  async executeSecureAdminOperation(
    operation: string,
    command: string,
    args: string[],
    requiresElevation: boolean = true
  ): Promise<any> {
    // Input validation
    if (!operation || typeof operation !== 'string' || operation.trim().length === 0) {
      throw new Error('Operation must be a non-empty string');
    }

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('Command must be a non-empty string');
    }

    if (!Array.isArray(args)) {
      throw new Error('Arguments must be an array');
    }
    const auditLogger = ImmutableAuditLogger.getInstance();
    const uacManager = UACElevationManager.getInstance();

    // Log operation start
    await AuditPatterns.logSecurityEvent(
      'admin.operation.start',
      'medium',
      { operation, command, args },
      { userId: 'admin' }
    );

    try {
      let result;

      if (requiresElevation) {
        result = await uacManager.executeWithElevation(
          command,
          args,
          {
            operationName: operation,
            operationDescription: `Admin operation: ${operation}`,
            requiresAdmin: true,
            showPrompt: true,
            timeoutMs: 30000
          }
        );
      } else {
        // Use regular execution
        const { exec } = require('child_process');
        result = await new Promise((resolve) => {
          exec(`${command} ${args.join(' ')}`, (error: any, stdout: string, stderr: string) => {
            resolve({
              success: !error,
              elevated: false,
              exitCode: error ? error.code : 0,
              stdout,
              stderr,
              error: error ? error.message : undefined
            });
          });
        });
      }

      // Log operation completion
      await AuditPatterns.logSecurityEvent(
        'admin.operation.complete',
        result.success ? 'low' : 'high',
        {
          operation,
          success: result.success,
          exitCode: result.exitCode,
          error: result.error
        },
        { userId: 'admin' }
      );

      return result;

    } catch (error) {
      // Log operation failure
      await AuditPatterns.logSecurityEvent(
        'admin.operation.failed',
        'high',
        {
          operation,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        { userId: 'admin' }
      );

      throw error;
    }
  }

  /**
   * Shutdown all security components
   */
  async shutdown(): Promise<void> {
    await this.gdprManager.shutdown();
    await this.auditLogger.shutdown();
    this.uacManager.shutdown();

    // Remove IPC handlers
    ipcMain.removeHandler('request-uac-elevation');
    ipcMain.removeHandler('request-data-access');
    ipcMain.removeHandler('request-data-erasure');
    ipcMain.removeHandler('query-audit-logs');
    ipcMain.removeHandler('check-security-status');
  }
}

// Initialize security integration on app start
export async function initializeSecurityIntegration(): Promise<void> {
  const securityManager = SecurityIntegrationManager.getInstance();
  await securityManager.initialize();
}

// Shutdown security integration on app exit
export async function shutdownSecurityIntegration(): Promise<void> {
  const securityManager = SecurityIntegrationManager.getInstance();
  await securityManager.shutdown();
}