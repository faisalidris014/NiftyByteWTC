# PowerShell script to reset Microsoft Teams and Outlook caches with safe archival
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "WTC-AppCacheBackups"
$backupPath = Join-Path $backupRoot $timestamp

$targets = @(
    @{ Name = "Teams"; Processes = @("Teams") ; Paths = @(
        Join-Path $env:APPDATA "Microsoft\\Teams",
        Join-Path $env:LOCALAPPDATA "Microsoft\\Teams"
    ) },
    @{ Name = "Outlook"; Processes = @("OUTLOOK") ; Paths = @(
        Join-Path $env:LOCALAPPDATA "Microsoft\\Outlook",
        Join-Path $env:LOCALAPPDATA "Microsoft\\Office\\16.0\\OfficeFileCache"
    ) }
)

function Stop-TargetProcesses {
    param(
        [string[]]$ProcessNames
    )

    foreach ($processName in $ProcessNames) {
        Get-Process -Name $processName -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Stop-Process -InputObject $_ -Force -ErrorAction Stop
            }
            catch {
                Write-Output "WARNING: Unable to stop process $processName: $($_.Exception.Message)"
            }
        }
    }
}

function Reset-CacheDirectories {
    param(
        [string]$AppName,
        [string[]]$Paths
    )

    $appBackup = Join-Path $backupPath $AppName

    foreach ($path in $Paths) {
        if (-Not (Test-Path -LiteralPath $path)) {
            continue
        }

        $destination = Join-Path $appBackup ((Split-Path -Path $path -Leaf) + "-" + $timestamp)
        New-Item -Path (Split-Path -Path $destination -Parent) -ItemType Directory -Force | Out-Null

        try {
            Move-Item -LiteralPath $path -Destination $destination -Force -ErrorAction Stop
        }
        catch {
            Write-Output "ERROR: Failed to archive cache at $path: $($_.Exception.Message)"
            throw
        }

        New-Item -Path $path -ItemType Directory -Force | Out-Null
    }
}

try {
    New-Item -Path $backupPath -ItemType Directory -Force | Out-Null

    foreach ($target in $targets) {
        Stop-TargetProcesses -ProcessNames $target.Processes
        Reset-CacheDirectories -AppName $target.Name -Paths $target.Paths
    }

    $result = [PSCustomObject]@{
        TimestampUtc = (Get-Date).ToUniversalTime()
        BackupLocation = $backupPath
        Applications = $targets.Name
    }

    Write-Output "SUCCESS: $(ConvertTo-Json $result -Compress)"
}
catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
