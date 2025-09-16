# PowerShell script to enumerate Microsoft Word AutoRecover files without modifying user data
$autoRecoverPaths = @(
    Join-Path $env:APPDATA "Microsoft\\Word",
    Join-Path $env:LOCALAPPDATA "Microsoft\\Office\\UnsavedFiles"
) | Sort-Object -Unique

function Get-RecoverableFiles {
    param(
        [string]$Path
    )

    if (-Not (Test-Path -LiteralPath $Path)) {
        return @()
    }

    Get-ChildItem -LiteralPath $Path -Filter "*.asd" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        [PSCustomObject]@{
            Name = $_.Name
            FullPath = $_.FullName
            LastModified = $_.LastWriteTimeUtc
            SizeKB = [Math]::Round($_.Length / 1KB, 2)
        }
    }
}

try {
    $results = @()
    foreach ($path in $autoRecoverPaths) {
        $results += Get-RecoverableFiles -Path $path
    }

    $sortedResults = $results | Sort-Object -Property LastModified -Descending

    $payload = [PSCustomObject]@{
        TimestampUtc = (Get-Date).ToUniversalTime()
        AutoRecoverFolders = $autoRecoverPaths
        Files = $sortedResults
    }

    Write-Output "SUCCESS: $(ConvertTo-Json $payload -Depth 4 -Compress)"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
