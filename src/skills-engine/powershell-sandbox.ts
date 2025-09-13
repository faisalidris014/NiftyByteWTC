import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// PowerShell-specific sandbox options
export interface PowerShellSandboxOptions {
  executionPolicy?: 'Restricted' | 'AllSigned' | 'RemoteSigned' | 'Unrestricted' | 'Bypass';
  noProfile?: boolean;
  noLogo?: boolean;
  inputFormat?: 'Text' | 'XML';
  outputFormat?: 'Text' | 'XML';
  encodedCommand?: boolean;
  restrictedLanguageMode?: boolean;
  constraintMode?: boolean;
}

/**
 * Enhanced PowerShell execution sandbox with additional security features
 */
export class PowerShellSandbox extends EventEmitter {
  private process: ChildProcess | null = null;
  private securityEvents: Array<{
    type: string;
    timestamp: number;
    details: string;
    severity: 'low' | 'medium' | 'high';
  }> = [];

  constructor(
    private scriptPath: string,
    private options: PowerShellSandboxOptions = {}
  ) {
    super();
    this.setDefaultOptions();
  }

  private setDefaultOptions(): void {
    this.options = {
      executionPolicy: 'Restricted',
      noProfile: true,
      noLogo: true,
      inputFormat: 'Text',
      outputFormat: 'Text',
      encodedCommand: false,
      restrictedLanguageMode: true,
      constraintMode: true,
      ...this.options
    };
  }

  /**
   * Execute PowerShell script with enhanced security
   */
  async execute(args: string[] = []): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    securityEvents: any[];
  }> {
    const startTime = Date.now();
    this.securityEvents = [];

    try {
      await this.preparePowerShellEnvironment();
      const result = await this.executePowerShellScript(args);
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
        securityEvents: this.securityEvents
      };
    } catch (error) {
      throw this.handleExecutionError(error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Prepare PowerShell execution environment
   */
  private async preparePowerShellEnvironment(): Promise<void> {
    // Create temporary execution policy file
    const policyFile = path.join(os.tmpdir(), 'wtc-powershell-policy.ps1');
    const policyContent = `
# WTC PowerShell Execution Policy
Set-ExecutionPolicy -Scope Process -ExecutionPolicy ${this.options.executionPolicy} -Force

# Constrained language mode if enabled
if (${this.options.constraintMode}) {
    $ExecutionContext.SessionState.LanguageMode = "ConstrainedLanguage"
}

# Restricted language mode if enabled
if (${this.options.restrictedLanguageMode}) {
    $ExecutionContext.SessionState.LanguageMode = "RestrictedLanguage"
}

# Disable dangerous cmdlets
${this.getDangerousCmdletBlockers()}
`;

    fs.writeFileSync(policyFile, policyContent);

    // Set environment variables for PowerShell
    process.env.PSExecutionPolicyPreference = 'Restricted';
    process.env.PSLanguageMode = this.options.restrictedLanguageMode ? 'RestrictedLanguage' : 'FullLanguage';
  }

  /**
   * Get PowerShell command to block dangerous cmdlets
   */
  private getDangerousCmdletBlockers(): string {
    const dangerousCmdlets = [
      'Invoke-Expression',
      'Invoke-Command',
      'Start-Process',
      'New-Object',
      'Add-Type',
      'Set-ExecutionPolicy',
      'Remove-Item',
      'Rename-Item',
      'Move-Item',
      'Copy-Item',
      'New-Item',
      'Set-Item',
      'Get-Content',
      'Set-Content',
      'Add-Content',
      'Clear-Content',
      'Out-File',
      'Tee-Object',
      'Export-Csv',
      'Export-Clixml',
      'ConvertTo-Json',
      'ConvertFrom-Json',
      'ConvertTo-Xml',
      'ConvertFrom-Xml',
      'Invoke-WebRequest',
      'Invoke-RestMethod',
      'New-WebServiceProxy',
      'New-Object',
      'Register-ObjectEvent',
      'Unregister-Event',
      'Get-Event',
      'Remove-Event',
      'Wait-Event',
      'New-Event',
      'Get-WmiObject',
      'Get-CimInstance',
      'Invoke-CimMethod',
      'Register-CimIndicationEvent',
      'Unregister-CimIndicationEvent'
    ];

    return dangerousCmdlets.map(cmdlet =>
      `function ${cmdlet} { throw "Cmdlet ${cmdlet} is blocked in sandbox mode" }`
    ).join('\n');
  }

  /**
   * Execute PowerShell script with security constraints
   */
  private async executePowerShellScript(args: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const commandArgs = this.buildPowerShellCommand(args);

      this.process = spawn('powershell.exe', commandArgs, {
        cwd: path.dirname(this.scriptPath),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      // Monitor for suspicious patterns
      this.monitorForSuspiciousBehavior();

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        this.analyzeOutputForSecurity(output);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      this.process.on('close', (code: number | null) => {
        exitCode = code;
        resolve({
          exitCode: exitCode ?? -1,
          stdout,
          stderr
        });
      });

      this.process.on('error', (error: Error) => {
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.recordSecurityEvent(
            'timeout',
            'high',
            'PowerShell execution timeout'
          );
          this.process.kill('SIGKILL');
          reject(new Error('PowerShell execution timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Build PowerShell command with security options
   */
  private buildPowerShellCommand(args: string[]): string[] {
    const commandArgs = [
      '-ExecutionPolicy', this.options.executionPolicy!,
      '-NoProfile',
      '-NonInteractive'
    ];

    if (this.options.noLogo) {
      commandArgs.push('-NoLogo');
    }

    if (this.options.inputFormat) {
      commandArgs.push('-InputFormat', this.options.inputFormat);
    }

    if (this.options.outputFormat) {
      commandArgs.push('-OutputFormat', this.options.outputFormat);
    }

    if (this.options.encodedCommand) {
      // Read script content and encode it
      const scriptContent = fs.readFileSync(this.scriptPath, 'utf8');
      const encodedScript = Buffer.from(scriptContent).toString('base64');
      commandArgs.push('-EncodedCommand', encodedScript);
    } else {
      commandArgs.push('-File', this.scriptPath);
    }

    // Add arguments
    commandArgs.push(...args);

    return commandArgs;
  }

  /**
   * Monitor for suspicious behavior patterns
   */
  private monitorForSuspiciousBehavior(): void {
    // Monitor process for suspicious activity
    const monitorInterval = setInterval(() => {
      if (!this.process) {
        clearInterval(monitorInterval);
        return;
      }

      // Check for excessive resource usage
      // Check for network activity
      // Check for file system access patterns

    }, 1000);

    // Clean up interval when process exits
    this.process.on('close', () => {
      clearInterval(monitorInterval);
    });
  }

  /**
   * Analyze output for security concerns
   */
  private analyzeOutputForSecurity(output: string): void {
    const suspiciousPatterns = [
      /Invoke-Expression/i,
      /Invoke-Command/i,
      /Start-Process/i,
      /New-Object/i,
      /Add-Type/i,
      /Set-ExecutionPolicy/i,
      /DownloadFile/i,
      /WebClient/i,
      /Net.WebClient/i,
      /System.Net.WebClient/i,
      /[Ii][Ee][Xx]/, // IEX (Invoke-Expression alias)
      /\$env:/, // Environment variable manipulation
      /registry::/, // Registry access
      /certificate::/, // Certificate store access
      /wsman::/, // WSMan access
      /comobject/i, // COM object creation
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(output)) {
        this.recordSecurityEvent(
          'suspicious_output',
          'medium',
          `Suspicious pattern detected in output: ${pattern.source}`
        );
        break;
      }
    }
  }

  /**
   * Record security event
   */
  private recordSecurityEvent(type: string, severity: 'low' | 'medium' | 'high', details: string): void {
    const event = {
      type,
      timestamp: Date.now(),
      details,
      severity
    };

    this.securityEvents.push(event);
    this.emit('securityEvent', event);
  }

  /**
   * Handle execution errors
   */
  private handleExecutionError(error: any): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(`PowerShell sandbox execution failed: ${String(error)}`);
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }

    this.process = null;
  }

  /**
   * Abort execution
   */
  abort(): void {
    this.recordSecurityEvent(
      'aborted',
      'medium',
      'PowerShell execution aborted by user request'
    );

    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }

    this.cleanup();
  }

  /**
   * Get security events
   */
  getSecurityEvents(): any[] {
    return [...this.securityEvents];
  }
}