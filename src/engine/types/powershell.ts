export interface PowerShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  success: boolean;
  timedOut: boolean;
  error?: string;
}

export interface PowerShellExecutionOptions {
  timeout?: number;
  executionPolicy?: 'Restricted' | 'AllSigned' | 'RemoteSigned' | 'Unrestricted' | 'Bypass';
  workingDirectory?: string;
  encoding?: string;
  noProfile?: boolean;
  parameters?: Record<string, any>;
  environment?: Record<string, string>;
}

export interface PowerShellScript {
  content: string;
  isFile?: boolean;
  parameters?: Record<string, any>;
}

export interface PowerShellSecurityOptions {
  maxExecutionTime: number;
  allowedCommands?: string[];
  blockedCommands?: string[];
  maxOutputLength: number;
  enableSandbox: boolean;
}