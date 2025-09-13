# Security Task 2: Fix Environment Variable Pollution

## Critical Security Vulnerability
**Severity:** HIGH
**File:** `/src/skills-engine/sandbox.ts` (Lines 165-171)

## Issue Description
The current implementation overwrites the entire process environment, which can lead to environment pollution and potential security issues in the parent process.

## Current Problematic Code
```typescript
process.env = {  // ❌ DANGEROUS: Overwrites entire process environment
  ...process.env,
  ...this.options.environmentVariables,
  WTC_SANDBOX: 'true',
  WTC_ALLOWED_DIRS: (this.options.allowedDirectories || []).join(path.delimiter)
};
```

## Required Fix
Pass environment variables only to child processes, not modify the parent process environment.

## Security Impact
- Parent process environment pollution
- Potential information leakage between processes
- Security context contamination

## Implementation Requirements
1. Never modify `process.env` directly
2. Pass environment variables only to child process spawn calls
3. Implement environment variable sanitization
4. Add validation for environment variable names and values

## Testing Requirements
- Unit tests for environment variable handling
- Security tests for environment isolation
- Validation tests for environment variable sanitization