# Skills Directory

This directory contains all troubleshooting skills for the Windows Troubleshooting Companion.

## Skill Structure:

Each skill consists of:
- `{skill-id}.json` - Skill metadata and configuration
- `{skill-id}.ps1` - PowerShell script implementation (for Windows)
- `{skill-id}.sh` - Shell script implementation (for macOS/Linux)

## Example Skill (Wi-Fi Reset):

### wifi-reset.json
```json
{
  "id": "wifi-reset",
  "name": "Wi-Fi Adapter Reset",
  "description": "Checks if Wi-Fi adapter is disabled and re-enables it",
  "os": ["windows"],
  "riskLevel": "medium",
  "requiresAdmin": true,
  "script": "wifi-reset.ps1",
  "version": "1.0.0",
  "parameters": [],
  "output": {
    "success": "Wi-Fi adapter successfully reset",
    "failure": "Failed to reset Wi-Fi adapter"
  }
}
```

### wifi-reset.ps1
```powershell
# PowerShell script to reset Wi-Fi adapter
try {
    $adapter = Get-NetAdapter -Name "Wi-Fi" -ErrorAction Stop
    if ($adapter.Status -eq "Disabled") {
        Enable-NetAdapter -Name "Wi-Fi" -Confirm:$false
        Write-Output "SUCCESS: Wi-Fi adapter enabled"
    } else {
        Write-Output "INFO: Wi-Fi adapter already enabled"
    }
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
```

## Skill Development Guidelines:

1. **Idempotent**: Skills should be safe to run multiple times
2. **Error Handling**: Proper error handling and meaningful output
3. **Security**: No sensitive data in scripts, proper sanitization
4. **Logging**: Clear success/failure messages for logging
5. **Performance**: Skills should execute quickly (<30 seconds)

## Deployment:

Skills are packaged with the application and can be toggled via the Admin Console.