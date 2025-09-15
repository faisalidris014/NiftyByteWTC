# PowerShell script to check disk space (Windows)
try {
    $diskInfo = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | Select-Object DeviceID,
        @{Name="SizeGB"; Expression={[math]::Round($_.Size / 1GB, 2)}},
        @{Name="FreeSpaceGB"; Expression={[math]::Round($_.FreeSpace / 1GB, 2)}},
        @{Name="FreePercent"; Expression={[math]::Round(($_.FreeSpace / $_.Size) * 100, 2)}}

    Write-Output "SUCCESS: $(ConvertTo-Json $diskInfo -Compress)"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}