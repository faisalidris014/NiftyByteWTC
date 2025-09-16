# PowerShell script to inspect disk capacity and reclaim space from safe temporary locations when thresholds are low
function Get-DiskStatistics {
    Get-CimInstance -ClassName Win32_LogicalDisk -ErrorAction Stop |
        Where-Object { $_.DriveType -eq 3 } |
        Select-Object DeviceID,
            @{Name="SizeGB"; Expression={[Math]::Round($_.Size / 1GB, 2)}},
            @{Name="FreeSpaceGB"; Expression={[Math]::Round($_.FreeSpace / 1GB, 2)}},
            @{Name="FreePercent"; Expression={[Math]::Round(($_.FreeSpace / $_.Size) * 100, 2)}}
}

function Invoke-SafeCleanup {
    param(
        [string]$Path,
        [int]$MaxAgeDays = 7
    )

    if (-Not (Test-Path -LiteralPath $Path)) {
        return [PSCustomObject]@{
            Path = $Path
            RemovedFiles = 0
            FreedMB = 0
            Notes = "Path not found"
        }
    }

    $removed = 0
    $freedBytes = 0
    $threshold = (Get-Date).AddDays(-$MaxAgeDays)

    Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.PSIsContainer) {
            return
        }

        if ($_.LastWriteTime -lt $threshold) {
            try {
                $size = $_.Length
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                $removed += 1
                $freedBytes += $size
            }
            catch {
                # Ignore individual file failures but record note
            }
        }
    }

    return [PSCustomObject]@{
        Path = $Path
        RemovedFiles = $removed
        FreedMB = [Math]::Round($freedBytes / 1MB, 2)
        Notes = "Files older than $MaxAgeDays days removed"
    }
}

try {
    $diskInfo = Get-DiskStatistics
    $cleanupPerformed = $false
    $cleanupResults = @()

    $lowCapacityDisks = $diskInfo | Where-Object { $_.FreePercent -lt 15 }
    if ($lowCapacityDisks) {
        $cleanupPerformed = $true
        $pathsToClean = @(
            $env:TEMP,
            Join-Path $env:LOCALAPPDATA "Temp",
            Join-Path $env:SystemRoot "Temp"
        ) | Sort-Object -Unique

        foreach ($path in $pathsToClean) {
            $cleanupResults += Invoke-SafeCleanup -Path $path -MaxAgeDays 5
        }
    }

    $payload = [PSCustomObject]@{
        TimestampUtc = (Get-Date).ToUniversalTime()
        DiskInfo = $diskInfo
        CleanupTriggered = $cleanupPerformed
        CleanupResults = $cleanupResults
    }

    Write-Output "SUCCESS: $(ConvertTo-Json $payload -Depth 5 -Compress)"
}
catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
