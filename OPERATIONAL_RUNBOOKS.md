# Windows AI Troubleshooter - Operational Runbooks

## Table of Contents
1. [Deployment Runbooks](#deployment-runbooks)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Backup & Recovery](#backup--recovery)
4. [Performance Tuning](#performance-tuning)
5. [Upgrade Procedures](#upgrade-procedures)
6. [Incident Response](#incident-response)
7. [Security Operations](#security-operations)

---

## Deployment Runbooks

### Production Deployment

#### Prerequisites
- ✅ Node.js 18.x+ installed on target systems
- ✅ Windows Build Tools installed (for native modules)
- ✅ Sufficient disk space (minimum 500MB)
- ✅ Administrative privileges for installation
- ✅ Network connectivity for enterprise deployments

#### Silent Installation (Enterprise)

**MSI Installation:**
```bash
# Basic silent installation
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart

# Custom installation directory
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart INSTALLDIR="C:\Program Files\WTC"

# Disable desktop shortcut
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart CREATEDESKTOPSHORTCUT=0

# Target the pilot update channel
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart WTC_UPDATE_CHANNEL=pilot

# Enable auto-start
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart AUTOSTART=1
```

**EXE Installation:**
```bash
# NSIS installer silent mode
"Windows Troubleshooting Companion Setup 1.0.0.exe" /S

# Custom installation path
"Windows Troubleshooting Companion Setup 1.0.0.exe" /S /D=C:\Custom\Path
```

#### Deployment Validation Checklist

- [ ] Application launches successfully
- [ ] System tray icon appears
- [ ] IPC communication established
- [ ] Skills execute without errors
- [ ] Logging functional
- [ ] Resource monitoring active
- [ ] Security events recorded
- [ ] Performance within expected ranges

### Configuration Management

#### Environment Configuration
```bash
# Set production environment
set NODE_ENV=production

# Enable debug logging (if needed)
set DEBUG=wtc:*,electron:main

# Custom log directory
set WTC_LOG_DIR=C:\ProgramData\WTC\Logs

# Configuration file location
set WTC_CONFIG_PATH=C:\ProgramData\WTC\config.json
```

#### Registry Settings (Windows)
```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\NiftyByte\WTC]
"InstallPath"="C:\\Program Files\\Windows Troubleshooting Companion"
"LogLevel"="info"
"AutoStart"=dword:00000001
"MaxMemoryMB"=dword:00000100

[HKEY_CURRENT_USER\SOFTWARE\NiftyByte\WTC]
"Theme"="dark"
"Notifications"=dword:00000001
```

### Rollback Procedures

#### Emergency Rollback
```bash
# Execute packaged rollback helper
powershell.exe -ExecutionPolicy Bypass -File "C:\\Program Files\\Windows Troubleshooting Companion\\resources\\app\\build\\rollback.ps1" ^
  -PreviousInstallerPath "C:\\ProgramData\\NiftyByte\\WTC\\Packages\\wtc-1.0.0.msi"

# Restore configuration if required
xcopy "C:\\Backup\\WTC\\config.json" "C:\\ProgramData\\WTC\\" /Y

# Relaunch application
start "" "C:\\Program Files\\Windows Troubleshooting Companion\\WTC.exe"
```

#### Rollback Validation
- [ ] Previous version installed successfully
- [ ] Configuration restored
- [ ] Application functional
- [ ] No data loss occurred
- [ ] Performance baseline restored

---

## Monitoring & Alerting

### Key Performance Indicators

#### Application Metrics
```typescript
// Key metrics to monitor
const metrics = {
  // Process metrics
  process_count: 'number of active processes',
  memory_usage_mb: 'memory consumption in MB',
  cpu_percentage: 'CPU utilization percentage',

  // IPC metrics
  ipc_message_rate: 'messages per second',
  ipc_latency_ms: 'average message latency',
  connection_state: 'connection status',

  // Skill execution metrics
  skill_execution_count: 'total executions',
  skill_success_rate: 'percentage of successful executions',
  skill_execution_time: 'average execution time',

  // Resource metrics
  disk_usage_mb: 'disk space used',
  network_usage_mb: 'network traffic',

  // Error metrics
  error_rate: 'errors per minute',
  timeout_count: 'timeout occurrences',
  security_events: 'security events count'
};
```

### Alert Configuration

#### Critical Alerts (PagerDuty/OpsGenie)
```yaml
# Critical resource alerts
alerts:
  - name: high_memory_usage
    condition: memory_usage > 90%
    duration: 5m
    severity: critical
    notify: pagerduty

  - name: process_crash
    condition: process_count == 0
    duration: 1m
    severity: critical
    notify: pagerduty

  - name: ipc_disconnect
    condition: connection_state == 'disconnected'
    duration: 2m
    severity: critical
    notify: opsgenie
```

#### Warning Alerts (Email/Slack)
```yaml
# Warning alerts
alerts:
  - name: elevated_cpu_usage
    condition: cpu_percentage > 80%
    duration: 10m
    severity: warning
    notify: slack

  - name: increased_error_rate
    condition: error_rate > 10
    duration: 5m
    severity: warning
    notify: email

  - name: skill_timeout_increase
    condition: timeout_count > 5
    duration: 15m
    severity: warning
    notify: slack
```

#### Notification Channels
- Email: `alerts@example.com` (warning and above)
- Slack: `#wtc-alerts` webhook (critical)
- Teams: `operations-room` webhook (critical)

Configure channels at runtime using `LogManager.configureAlerting({ channels })`.

### Monitoring Tools Integration

#### Prometheus Metrics
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'wtc'
    static_configs:
      - targets: ['localhost:9091']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "WTC Monitoring",
    "panels": [
      {
        "title": "CPU Usage",
        "type": "graph",
        "targets": [{
          "expr": "rate(wtc_cpu_seconds_total[5m])"
        }]
      },
      {
        "title": "Memory Usage",
        "type": "singlestat",
        "targets": [{
          "expr": "wtc_memory_usage_bytes"
        }]
      }
    ]
  }
}
```

#### Elasticsearch Logging
```yaml
# Filebeat configuration
filebeat.inputs:
- type: log
  paths:
    - "C:\\ProgramData\\WTC\\Logs\\*.log"

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  indices:
    - index: "wtc-logs-%{+yyyy.MM.dd}"
```

---

## Backup & Recovery

### Backup Procedures

#### Configuration Backup
```bash
# Backup configuration files
xcopy "C:\ProgramData\WTC\config.json" "Z:\Backups\WTC\config\" /Y
xcopy "C:\ProgramData\WTC\skills\" "Z:\Backups\WTC\skills\" /E /Y

# Backup registry settings
reg export "HKEY_CURRENT_USER\SOFTWARE\NiftyByte\WTC" "Z:\Backups\WTC\registry\user.reg"
reg export "HKEY_LOCAL_MACHINE\SOFTWARE\NiftyByte\WTC" "Z:\Backups\WTC\registry\system.reg"

# Backup logs (optional)
xcopy "C:\ProgramData\WTC\Logs\" "Z:\Backups\WTC\logs\" /E /Y
```

#### Automated Backup Script
```powershell
# backup-wtc.ps1
$backupDir = "Z:\Backups\WTC\$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force

# Copy configuration
Copy-Item "C:\ProgramData\WTC\config.json" -Destination "$backupDir\"
Copy-Item "C:\ProgramData\WTC\skills\" -Destination "$backupDir\skills\" -Recurse

# Export registry
reg export "HKEY_CURRENT_USER\SOFTWARE\NiftyByte\WTC" "$backupDir\user.reg"
reg export "HKEY_LOCAL_MACHINE\SOFTWARE\NiftyByte\WTC" "$backupDir\system.reg"

# Compress backup
Compress-Archive -Path "$backupDir\*" -DestinationPath "$backupDir.zip"
Remove-Item -Path $backupDir -Recurse -Force

Write-Output "Backup completed: $backupDir.zip"
```

### Recovery Procedures

#### Full System Recovery
```bash
# Stop application
taskkill /f /im "Windows Troubleshooting Companion.exe"

# Restore from backup
Expand-Archive -Path "Z:\Backups\WTC\backup.zip" -DestinationPath "C:\ProgramData\WTC\" -Force

# Restore registry settings
reg import "C:\ProgramData\WTC\user.reg"
reg import "C:\ProgramData\WTC\system.reg"

# Restart application
start "" "C:\Program Files\Windows Troubleshooting Companion\WTC.exe"
```

#### Partial Recovery Scenarios

**Configuration Recovery Only:**
```bash
# Restore only configuration
xcopy "Z:\Backups\WTC\config.json" "C:\ProgramData\WTC\" /Y

# Restart application to apply changes
taskkill /f /im "Windows Troubleshooting Companion.exe"
start "" "C:\Program Files\Windows Troubleshooting Companion\WTC.exe"
```

**Skills Recovery:**
```bash
# Restore skills directory
xcopy "Z:\Backups\WTC\skills\" "C:\ProgramData\WTC\skills\" /E /Y

# No restart needed - skills are loaded dynamically
```

### Backup Validation

#### Validation Checklist
- [ ] Backup files exist and are accessible
- [ ] Configuration files are valid JSON
- [ ] Skills scripts are executable
- [ ] Registry exports can be imported
- [ ] Backup compression successful
- [ ] Restoration test performed

#### Automated Validation Script
```powershell
# validate-backup.ps1
$backupPath = $args[0]

# Check backup exists
if (-not (Test-Path $backupPath)) {
    throw "Backup file not found: $backupPath"
}

# Validate configuration
$tempDir = "$env:TEMP\wtc-backup-validation"
Expand-Archive -Path $backupPath -DestinationPath $tempDir -Force

# Check config.json
$config = Get-Content "$tempDir\config.json" | ConvertFrom-Json
if (-not $config) {
    throw "Invalid configuration file"
}

# Validate skills
$skills = Get-ChildItem "$tempDir\skills\*.json"
foreach ($skill in $skills) {
    $skillData = Get-Content $skill.FullName | ConvertFrom-Json
    if (-not $skillData.id -or -not $skillData.script) {
        throw "Invalid skill: $($skill.Name)"
    }
}

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force

Write-Output "Backup validation successful"
```

---

## Performance Tuning

### Resource Optimization

#### Memory Optimization
```typescript
// Reduce memory usage
const optimizationSettings = {
  // Reduce cache sizes
  maxCachedSkills: 10,
  maxLogEntries: 1000,

  // Optimize garbage collection
  gcInterval: 30000, // 30 seconds

  // Limit concurrent operations
  maxConcurrentExecutions: 3,
  maxPendingRequests: 10,

  // Reduce buffer sizes
  ipcBufferSize: 8192, // 8KB
  logBufferSize: 4096   // 4KB
};
```

#### CPU Optimization
```bash
# Set CPU affinity (if needed)
# Restrict to specific CPU cores
taskset -c 0,1 "C:\Program Files\WTC\WTC.exe"

# Adjust process priority
wmic process where name="WTC.exe" CALL setpriority "below normal"
```

### Configuration Tuning

#### IPC Optimization
```json
{
  "ipc": {
    "heartbeatInterval": 10000,      // 10 seconds instead of 5
    "timeoutMultiplier": 1.5,        // Increase timeouts by 50%
    "maxRetryAttempts": 2,           // Reduce retry attempts
    "connectionTimeout": 15000       // 15 second connection timeout
  }
}
```

#### Sandbox Optimization
```json
{
  "sandbox": {
    "resourceCheckInterval": 500,    // Check every 500ms instead of 250ms
    "maxConcurrentSandboxes": 2,     // Limit concurrent executions
    "memoryOvercommitFactor": 1.1,   // Allow 10% memory overcommit
    "cpuThrottleThreshold": 70       // Throttle at 70% CPU instead of 50%
  }
}
```

### Performance Monitoring

#### Baseline Establishment
```bash
# Establish performance baseline
$baseline = @{
  startup_time = Measure-Command { start-process "C:\Program Files\WTC\WTC.exe" -PassThru }
  memory_usage = (Get-Process WTC).WorkingSet64 / 1MB
  cpu_usage = (Get-Counter '\Process(WTC)\% Processor Time').CounterSamples.CookedValue
}

# Save baseline
$baseline | ConvertTo-Json | Out-File "C:\ProgramData\WTC\baseline.json"
```

#### Performance Regression Testing
```powershell
# performance-test.ps1
$current = @{
  startup_time = Measure-Command { start-process "C:\Program Files\WTC\WTC.exe" -PassThru }
  memory_usage = (Get-Process WTC).WorkingSet64 / 1MB
}

$baseline = Get-Content "C:\ProgramData\WTC\baseline.json" | ConvertFrom-Json

# Check for regressions
if ($current.startup_time.TotalMilliseconds -gt $baseline.startup_time * 1.2) {
    Write-Warning "Startup time regression detected"
}

if ($current.memory_usage -gt $baseline.memory_usage * 1.15) {
    Write-Warning "Memory usage regression detected"
}
```

---

## Upgrade Procedures

### Version Upgrade

#### Pre-Upgrade Checklist
- [ ] Backup current configuration and data
- [ ] Review release notes for breaking changes
- [ ] Test upgrade in staging environment
- [ ] Notify users of planned maintenance
- [ ] Verify rollback procedure works

#### Upgrade Process
```bash
# Stop current version
taskkill /f /im "Windows Troubleshooting Companion.exe"

# Backup current installation
xcopy "C:\Program Files\Windows Troubleshooting Companion\" "C:\Backup\WTC\previous\" /E /Y

# Install new version
msiexec /i "Windows Troubleshooting Companion 1.1.0.msi" /quiet /norestart

# Migrate configuration (if needed)
# Check if configuration format changed
if (Test-Path "C:\Backup\WTC\previous\config.json") {
    # Use migration tool if available
    .\migrate-config.ps1 "C:\Backup\WTC\previous\config.json" "C:\ProgramData\WTC\config.json"
}

# Start new version
start "" "C:\Program Files\Windows Troubleshooting Companion\WTC.exe"
```

#### Post-Upgrade Validation
- [ ] Application starts successfully
- [ ] All skills functional
- [ ] Configuration migrated correctly
- [ ] Performance within expected range
- [ ] No regression in functionality
- [ ] Logging and monitoring working

### Configuration Migration

#### Automated Migration Script
```powershell
# migrate-config.ps1
param($oldConfigPath, $newConfigPath)

$oldConfig = Get-Content $oldConfigPath | ConvertFrom-Json
$newConfig = @{}

# Migrate known properties
if ($oldConfig.PSObject.Properties['ipc']) {
    $newConfig.ipc = $oldConfig.ipc
}

if ($oldConfig.PSObject.Properties['sandbox']) {
    $newConfig.sandbox = $oldConfig.sandbox
}

# Add new properties with defaults
$newConfig.monitoring = @{
    enabled = $true,
    interval = 30000
}

# Save new configuration
$newConfig | ConvertTo-Json -Depth 10 | Out-File $newConfigPath

Write-Output "Configuration migrated successfully"
```

---

## Incident Response

### Incident Classification

#### Severity Levels
- **SEV-1**: Critical - System down, data loss, security breach
- **SEV-2**: High - Major functionality impaired
- **SEV-3**: Medium - Minor functionality issues
- **SEV-4**: Low - Cosmetic issues, minor bugs

### Response Procedures

#### SEV-1 Incident Response
```bash
# Immediate actions
1. Declare incident and notify team
2. Stop application: taskkill /f /im "WTC.exe"
3. Isolate affected systems if security breach
4. Begin investigation

# Communication
- Update status every 15 minutes
- Notify stakeholders of impact
- Document all actions taken

# Resolution
- Implement fix or rollback
- Validate resolution
- Conduct post-mortem
```

#### SEV-2 Incident Response
```bash
# Actions within 1 hour
1. Investigate root cause
2. Implement workaround if available
3. Notify affected users
4. Plan permanent fix

# Communication
- Update status hourly
- Provide ETA for resolution
- Document progress
```

### Incident Documentation

#### Incident Report Template
```markdown
# Incident Report: [Incident ID]

## Summary
- **Date:** [Date]
- **Time:** [Start Time] - [End Time]
- **Severity:** SEV-[1-4]
- **Affected Systems:** [Systems]

## Impact
- [Description of impact on users/business]

## Root Cause
- [Technical root cause analysis]

## Resolution
- [Steps taken to resolve]

## Lessons Learned
- [What went well]
- [What could be improved]
- [Action items for prevention]

## Participants
- [Team members involved]
```

---

## Security Operations

### Security Monitoring

#### Security Event Types
```typescript
// Monitor these security events
const securityEvents = {
  resource_exceeded: 'High severity',
  suspicious_behavior: 'High severity',
  filesystem_access: 'Medium severity',
  network_access: 'Medium severity',
  permission_denied: 'Low severity'
};
```

#### Security Alert Configuration
```yaml
security_alerts:
  - name: multiple_failed_attempts
    condition: security_events{suspicious_behavior} > 5
    duration: 1m
    severity: high

  - name: resource_attack
    condition: security_events{resource_exceeded} > 3
    duration: 5m
    severity: critical

  - name: unauthorized_access
    condition: security_events{permission_denied} > 10
    duration: 10m
    severity: medium
```

### Security Incident Response

#### Investigation Procedures
```bash
# Collect evidence
1. Preserve logs: xcopy "C:\ProgramData\WTC\Logs\*" "Z:\Investigation\" /Y
2. Capture process information: Get-Process WTC > "Z:\Investigation\process.txt"
3. Export registry settings
4. Collect network connections: netstat -ano > "Z:\Investigation\network.txt"

# Analysis
1. Review security events in logs
2. Check for unusual resource usage
3. Verify skill execution patterns
4. Look for external connections
```

#### Containment Procedures
```bash
# Immediate containment
1. Isolate affected system from network
2. Stop application: taskkill /f /im "WTC.exe"
3. Disable auto-start if compromised
4. Preserve evidence for forensic analysis

# Investigation
1. Analyze logs for IOCs (Indicators of Compromise)
2. Check for modified files
3. Review recent skill executions
4. Look for unusual process behavior
```

### Security Hardening

#### Ongoing Security Tasks
- [ ] Regular security patching
- [ ] Security configuration reviews
- [ ] Penetration testing
- [ ] Access control audits
- [ ] Log analysis for anomalies
- [ ] Threat intelligence monitoring

#### Security Checklist
- [ ] Application running with least privileges
- [ ] Network access restricted
- [ ] Resource limits enforced
- [ ] Logging enabled and monitored
- [ ] Regular backups performed
- [ ] Security updates applied
- [ ] Incident response plan tested

---

## Appendices

### Emergency Contacts
```
# Operations Team
- Primary: ops-team@example.com / +1-555-0100
- Secondary: backup-ops@example.com / +1-555-0101

# Security Team
- security@example.com / +1-555-0200
- Emergency: security-emergency@example.com / +1-555-0201

# Management
- manager@example.com / +1-555-0300
```

### Common Troubleshooting Commands
```bash
# Check application status
tasklist /fi "imagename eq WTC.exe"

# View recent logs
tail -f "C:\ProgramData\WTC\Logs\app.log"

# Check resource usage
Get-Process WTC | Format-Table CPU, WorkingSet, PM

# Test IPC connection
# Use developer tools to send test messages

# Restart application
taskkill /f /im "WTC.exe" && start "" "C:\Program Files\WTC\WTC.exe"
```

### Performance Counters
```bash
# Monitor performance counters
typeperf "\Process(WTC)\% Processor Time" "\Process(WTC)\Working Set"

# Log performance data
Get-Counter '\Process(WTC)\*' -SampleInterval 5 -MaxSamples 12
```

---

*These runbooks are living documents. Update them regularly based on operational experience and changing requirements.*
