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