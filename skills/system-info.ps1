# PowerShell script to gather system information
try {
    $systemInfo = @{
        ComputerName = $env:COMPUTERNAME
        OSVersion = [System.Environment]::OSVersion.VersionString
        TotalMemory = [math]::Round((Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
        FreeMemory = [math]::Round((Get-CimInstance -ClassName Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
        Processor = (Get-CimInstance -ClassName Win32_Processor).Name
        Uptime = [timespan]::FromMilliseconds([Environment]::TickCount)
    }

    Write-Output "SUCCESS: $(ConvertTo-Json $systemInfo -Compress)"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}