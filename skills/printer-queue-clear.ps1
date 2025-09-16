# PowerShell script to safely reset the print spooler service and clear queued jobs
$spoolerServiceName = "Spooler"
$spoolDirectory = Join-Path $env:SystemRoot "System32\\spool\\PRINTERS"

function Clear-SpoolerQueue {
    param (
        [string]$DirectoryPath
    )

    if (-Not (Test-Path -Path $DirectoryPath)) {
        Write-Output "WARNING: Spool directory not found at $DirectoryPath"
        return
    }

    Get-ChildItem -Path $DirectoryPath -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -Path $_.FullName -Force -ErrorAction Stop
        }
        catch {
            Write-Output "ERROR: Failed to remove spool file $($_.FullName): $($_.Exception.Message)"
            throw
        }
    }
}

try {
    $service = Get-Service -Name $spoolerServiceName -ErrorAction Stop

    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $spoolerServiceName -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }

    Clear-SpoolerQueue -DirectoryPath $spoolDirectory

    Start-Service -Name $spoolerServiceName -ErrorAction Stop
    Write-Output "SUCCESS: Print spooler reset and queue cleared successfully."
}
catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
