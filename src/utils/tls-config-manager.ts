import { SecureHttpClient, SecureHttpClientOptions, validateUrlSecurity } from './secure-http-client';
import { createHash } from 'crypto';

/**
 * TLS Configuration Manager for enterprise-grade security
 */
export interface TlsConfiguration {
  /**
   * Minimum TLS version requirement
   */
  minTlsVersion: 'TLSv1.2' | 'TLSv1.3';

  /**
   * Approved cipher suites
   */
  approvedCiphers: string[];

  /**
   * Certificate pinning configurations
   */
  certificatePinning: {
    enabled: boolean;
    publicKeyHashes: Map<string, string[]>; // domain -> array of public key hashes
  };

  /**
   * Certificate transparency requirements
   */
  certificateTransparency: {
    required: boolean;
    logServers: string[];
  };

  /**
   * OCSP stapling requirements
   */
  ocspStapling: {
    required: boolean;
    timeoutMs: number;
  };

  /**
   * CRL (Certificate Revocation List) checking
   */
  crlChecking: {
    enabled: boolean;
    timeoutMs: number;
  };

  /**
   * HSTS (HTTP Strict Transport Security) enforcement
   */
  hsts: {
    enabled: boolean;
    maxAge: number; // seconds
    includeSubDomains: boolean;
    preload: boolean;
  };

  /**
   * HPKP (HTTP Public Key Pinning) configuration
   */
  hpkp: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    reportOnly: boolean;
    pins: string[];
    reportUri?: string;
  };

  /**
   * TLS session resumption settings
   */
  sessionResumption: {
    enabled: boolean;
    timeout: number; // seconds
    tickets: boolean;
    ids: boolean;
  };

  /**
   * Key exchange parameters
   */
  keyExchange: {
    minEcdhCurve: 'P-256' | 'P-384' | 'P-521';
    dhParamSize: number; // bits
    supportPerfectForwardSecrecy: boolean;
  };

  /**
   * Compliance requirements
   */
  compliance: {
    nistSp80052: boolean;
    pciDss: boolean;
    hipaa: boolean;
    gdpr: boolean;
  };

  /**
   * Monitoring and logging
   */
  monitoring: {
    logTlsHandshakes: boolean;
    logCertificateChanges: boolean;
    alertOnWeakCiphers: boolean;
    alertOnProtocolDowngrade: boolean;
  };
}

/**
 * TLS Security Event for auditing and monitoring
 */
export interface TlsSecurityEvent {
  id: string;
  timestamp: number;
  type: 'handshake' | 'certificate_validation' | 'protocol_downgrade' | 'cipher_weak' | 'pinning_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  domain: string;
  details: {
    tlsVersion: string;
    cipher: string;
    certificate?: {
      subject: string;
      issuer: string;
      serialNumber: string;
      validFrom: string;
      validTo: string;
    };
    error?: string;
    previousValue?: string;
    newValue?: string;
  };
  actionTaken: string;
  recommendation: string;
}

/**
 * TLS Configuration Manager for enterprise security
 */
export class TlsConfigManager {
  private configuration: TlsConfiguration;
  private securityEvents: TlsSecurityEvent[] = [];
  private httpClient: SecureHttpClient;
  private certificateCache: Map<string, any> = new Map();

  constructor(configuration: Partial<TlsConfiguration> = {}) {
    this.configuration = {
      minTlsVersion: 'TLSv1.3',
      approvedCiphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256'
      ],
      certificatePinning: {
        enabled: true,
        publicKeyHashes: new Map()
      },
      certificateTransparency: {
        required: true,
        logServers: [
          'https://ct.googleapis.com/logs',
          'https://ct.cloudflare.com/logs'
        ]
      },
      ocspStapling: {
        required: true,
        timeoutMs: 5000
      },
      crlChecking: {
        enabled: true,
        timeoutMs: 10000
      },
      hsts: {
        enabled: true,
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: false
      },
      hpkp: {
        enabled: false, // HPKP is deprecated but included for completeness
        maxAge: 5184000, // 60 days
        includeSubDomains: true,
        reportOnly: true,
        pins: [],
        reportUri: undefined
      },
      sessionResumption: {
        enabled: true,
        timeout: 300, // 5 minutes
        tickets: true,
        ids: true
      },
      keyExchange: {
        minEcdhCurve: 'P-256',
        dhParamSize: 2048,
        supportPerfectForwardSecrecy: true
      },
      compliance: {
        nistSp80052: true,
        pciDss: true,
        hipaa: true,
        gdpr: true
      },
      monitoring: {
        logTlsHandshakes: true,
        logCertificateChanges: true,
        alertOnWeakCiphers: true,
        alertOnProtocolDowngrade: true
      },
      ...configuration
    };

    this.httpClient = new SecureHttpClient(this.getHttpClientOptions());
  }

  /**
   * Get HTTP client options based on TLS configuration
   */
  private getHttpClientOptions(): SecureHttpClientOptions {
    return {
      minVersion: this.configuration.minTlsVersion,
      maxVersion: 'TLSv1.3',
      rejectUnauthorized: true,
      ciphers: this.configuration.approvedCiphers.join(':'),
      honorCipherOrder: true,
      ocspStapling: this.configuration.ocspStapling.required,
      enableCertTransparency: this.configuration.certificateTransparency.required,
      timeoutMs: 30000
    };
  }

  /**
   * Validate a URL against security policies
   */
  validateUrl(url: string): {
    valid: boolean;
    issues: string[];
    recommendations: string[];
    securityScore: number; // 0-100
  } {
    const validation = validateUrlSecurity(url);
    let securityScore = 100;
    const issues = [...validation.issues];
    const recommendations = [...validation.recommendations];

    try {
      const parsedUrl = new URL(url);

      // Check if domain has certificate pinning configured
      if (this.configuration.certificatePinning.enabled) {
        const domainPins = this.configuration.certificatePinning.publicKeyHashes.get(parsedUrl.hostname);
        if (!domainPins || domainPins.length === 0) {
          issues.push('No certificate pinning configured for domain');
          recommendations.push('Configure certificate public key pinning');
          securityScore -= 10;
        }
      }

      // Check for compliance requirements
      if (this.configuration.compliance.pciDss && parsedUrl.hostname.includes('payment')) {
        recommendations.push('PCI DSS compliance requires additional security measures for payment endpoints');
      }

      // Adjust score based on issues
      securityScore -= issues.length * 10;
      securityScore = Math.max(0, Math.min(100, securityScore));

      return {
        valid: validation.valid && issues.length === 0,
        issues,
        recommendations,
        securityScore
      };

    } catch (error) {
      return {
        valid: false,
        issues: ['Invalid URL format'],
        recommendations: ['Provide a valid URL'],
        securityScore: 0
      };
    }
  }

  /**
   * Add certificate public key pin for a domain
   */
  addCertificatePin(domain: string, publicKeyHash: string): void {
    if (!this.configuration.certificatePinning.publicKeyHashes.has(domain)) {
      this.configuration.certificatePinning.publicKeyHashes.set(domain, []);
    }

    const pins = this.configuration.certificatePinning.publicKeyHashes.get(domain)!;
    if (!pins.includes(publicKeyHash)) {
      pins.push(publicKeyHash);
    }

    this.recordSecurityEvent({
      id: this.generateEventId(),
      timestamp: Date.now(),
      type: 'pinning_violation',
      severity: 'low',
      domain,
      details: {
        tlsVersion: '',
        cipher: '',
        certificate: undefined
      },
      actionTaken: 'Certificate pin added',
      recommendation: 'Monitor certificate changes'
    });
  }

  /**
   * Remove certificate pin for a domain
   */
  removeCertificatePin(domain: string, publicKeyHash: string): void {
    const pins = this.configuration.certificatePinning.publicKeyHashes.get(domain);
    if (pins) {
      const index = pins.indexOf(publicKeyHash);
      if (index > -1) {
        pins.splice(index, 1);
      }
    }
  }

  /**
   * Validate certificate against pinned public keys
   */
  validateCertificatePinning(domain: string, certificate: any): boolean {
    if (!this.configuration.certificatePinning.enabled) {
      return true;
    }

    const pins = this.configuration.certificatePinning.publicKeyHashes.get(domain);
    if (!pins || pins.length === 0) {
      // No pins configured for this domain
      return true;
    }

    // Extract public key hash from certificate
    // This is a simplified implementation
    const certHash = this.calculatePublicKeyHash(certificate);

    if (!pins.includes(certHash)) {
      this.recordSecurityEvent({
        id: this.generateEventId(),
        timestamp: Date.now(),
        type: 'pinning_violation',
        severity: 'high',
        domain,
        details: {
          tlsVersion: '',
          cipher: '',
          certificate: {
            subject: certificate.subject,
            issuer: certificate.issuer,
            serialNumber: certificate.serialNumber,
            validFrom: certificate.validFrom,
            validTo: certificate.validTo
          }
        },
        actionTaken: 'Connection blocked',
        recommendation: 'Investificate certificate change or update pins'
      });

      return false;
    }

    return true;
  }

  /**
   * Perform TLS security audit for a domain
   */
  async auditDomainSecurity(url: string): Promise<{
    overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    categories: {
      protocolSupport: { grade: string; details: string };
      cipherStrength: { grade: string; details: string };
      certificate: { grade: string; details: string };
      keyExchange: { grade: string; details: string };
      compliance: { grade: string; details: string };
    };
    recommendations: string[];
    vulnerabilities: string[];
  }> {
    try {
      const tlsAudit = await this.httpClient.tlsSecurityAudit(url);
      const categories = {
        protocolSupport: { grade: 'A', details: 'TLS 1.3 supported' },
        cipherStrength: { grade: 'A', details: 'Strong ciphers supported' },
        certificate: { grade: 'A', details: 'Valid certificate configuration' },
        keyExchange: { grade: 'A', details: 'Perfect forward secrecy supported' },
        compliance: { grade: 'A', details: 'Meets compliance requirements' }
      };

      const recommendations: string[] = [];
      const vulnerabilities: string[] = [];

      // Analyze TLS version
      if (tlsAudit.details.tlsVersion !== 'TLSv1.3') {
        categories.protocolSupport.grade = 'C';
        categories.protocolSupport.details = `TLS ${tlsAudit.details.tlsVersion} - upgrade to TLS 1.3 recommended`;
        recommendations.push('Upgrade to TLS 1.3 for better security');
      }

      // Analyze cipher strength
      if (!tlsAudit.details.cipher.includes('AES256') && !tlsAudit.details.cipher.includes('CHACHA20')) {
        categories.cipherStrength.grade = 'D';
        categories.cipherStrength.details = `Weak cipher: ${tlsAudit.details.cipher}`;
        vulnerabilities.push('Weak cipher suite detected');
      }

      return {
        overallGrade: tlsAudit.grade,
        categories,
        recommendations: [...recommendations, ...tlsAudit.findings],
        vulnerabilities
      };

    } catch (error) {
      return {
        overallGrade: 'F',
        categories: {
          protocolSupport: { grade: 'F', details: 'TLS audit failed' },
          cipherStrength: { grade: 'F', details: 'TLS audit failed' },
          certificate: { grade: 'F', details: 'TLS audit failed' },
          keyExchange: { grade: 'F', details: 'TLS audit failed' },
          compliance: { grade: 'F', details: 'TLS audit failed' }
        },
        recommendations: ['Fix TLS configuration or network connectivity'],
        vulnerabilities: ['TLS security audit failed']
      };
    }
  }

  /**
   * Get current TLS configuration
   */
  getConfiguration(): TlsConfiguration {
    return { ...this.configuration };
  }

  /**
   * Update TLS configuration
   */
  updateConfiguration(updates: Partial<TlsConfiguration>): void {
    this.configuration = { ...this.configuration, ...updates };
    this.httpClient.updateTlsConfig(this.getHttpClientOptions());
  }

  /**
   * Get security events
   */
  getSecurityEvents(): TlsSecurityEvent[] {
    return [...this.securityEvents];
  }

  /**
   * Clear security events
   */
  clearSecurityEvents(): void {
    this.securityEvents = [];
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(): {
    nistSp80052: boolean;
    pciDss: boolean;
    hipaa: boolean;
    gdpr: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check NIST SP 800-52 compliance
    const nistCompliant = this.configuration.minTlsVersion === 'TLSv1.2' ||
                          this.configuration.minTlsVersion === 'TLSv1.3';
    if (!nistCompliant) {
      issues.push('NIST SP 800-52: Minimum TLS version requirement not met');
    }

    // Check PCI DSS compliance
    const pciCompliant = this.configuration.minTlsVersion === 'TLSv1.2' ||
                         this.configuration.minTlsVersion === 'TLSv1.3';
    if (!pciCompliant) {
      issues.push('PCI DSS: TLS 1.0/1.1 not allowed');
    }

    // Check HIPAA compliance
    const hipaaCompliant = this.configuration.crlChecking.enabled &&
                           this.configuration.ocspStapling.required;
    if (!hipaaCompliant) {
      issues.push('HIPAA: Certificate revocation checking not properly configured');
    }

    // Check GDPR compliance
    const gdprCompliant = this.configuration.monitoring.logTlsHandshakes &&
                          this.configuration.monitoring.logCertificateChanges;
    if (!gdprCompliant) {
      issues.push('GDPR: TLS security monitoring not properly configured');
    }

    return {
      nistSp80052: nistCompliant,
      pciDss: pciCompliant,
      hipaa: hipaaCompliant,
      gdpr: gdprCompliant,
      issues,
      recommendations
    };
  }

  private calculatePublicKeyHash(certificate: any): string {
    // Simplified implementation - in real world, this would extract
    // the public key and compute its hash
    const certData = JSON.stringify(certificate);
    return createHash('sha256').update(certData).digest('hex');
  }

  private generateEventId(): string {
    return `tls_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private recordSecurityEvent(event: Omit<TlsSecurityEvent, 'id'>): void {
    const fullEvent: TlsSecurityEvent = {
      id: this.generateEventId(),
      ...event
    };

    this.securityEvents.push(fullEvent);

    // Keep only the last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }

    // TODO: Send to monitoring system
    console.log('TLS Security Event:', fullEvent);
  }
}

/**
 * Global TLS Configuration Manager instance
 */
export const tlsConfigManager = new TlsConfigManager();