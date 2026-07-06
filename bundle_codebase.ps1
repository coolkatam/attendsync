$outputFile = "entire_codebase.txt"
$excludeFolders = @("node_modules", ".git", ".firebase", "dist", "build", ".next", "out")

if (Test-Path $outputFile) {
    Remove-Item $outputFile
    Write-Host "Cleared existing $outputFile" -ForegroundColor Yellow
}

$files = Get-ChildItem -Path . -Recurse -File | Where-Object {
    $excluded = $false
    foreach ($folder in $excludeFolders) {
        if ($_.FullName -match [regex]::Escape("\$folder\")) {
            $excluded = $true
            break
        }
    }
    -not $excluded
}

$fileCount = 0
Write-Host "Starting bundling..." -ForegroundColor Green

foreach ($file in $files) {
    $relativePath = $file.FullName | Resolve-Path -Relative
    
    Add-Content -Path $outputFile -Value "=== START_FILE: $relativePath ==="
    Add-Content -Path $outputFile -Value ""
    
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        Add-Content -Path $outputFile -Value $content
    } catch {
        Add-Content -Path $outputFile -Value "[ERROR: Could not read file]"
    }
    
    Add-Content -Path $outputFile -Value ""
    Add-Content -Path $outputFile -Value "=== END_FILE: $relativePath ==="
    Add-Content -Path $outputFile -Value ""
    Add-Content -Path $outputFile -Value ""
    
    $fileCount++
    Write-Host "Added: $relativePath"
}

Write-Host ""
Write-Host "BUNDLING COMPLETE" -ForegroundColor Green
Write-Host "Total files: $fileCount" -ForegroundColor Cyan
Write-Host "Output: $outputFile" -ForegroundColor Cyan