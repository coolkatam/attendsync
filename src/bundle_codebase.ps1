# bundle_codebase.ps1
# Bundles the entire AttendSync project into a single text file (entire_codebase.txt)
# for uploading to a new Claude chat, so Claude can see the whole codebase at once.
#
# Run from the project root: C:\Users\aruni\attendsync
#   powershell -ExecutionPolicy Bypass -File .\bundle_codebase.ps1

$outputFile = "entire_codebase.txt"

# Folders to completely skip
$excludeDirs = @("node_modules", "build", ".git", ".firebase", "functions\node_modules")

# File extensions worth including (skips images, fonts, lockfiles etc.)
$includeExtensions = @(".js", ".jsx", ".json", ".css", ".html", ".md", ".rules", ".ps1")

# Specific filenames worth always including even without a matching extension
$includeExactNames = @(".gitignore", ".firebaserc")

if (Test-Path $outputFile) { Remove-Item $outputFile }

function ShouldExclude($path) {
    foreach ($dir in $excludeDirs) {
        if ($path -like "*\$dir\*" -or $path -like "*\$dir") { return $true }
    }
    return $false
}

$allFiles = Get-ChildItem -Path . -Recurse -File | Where-Object {
    -not (ShouldExclude $_.FullName)
}

foreach ($file in $allFiles) {
    $ext = $file.Extension.ToLower()
    $name = $file.Name

    $include = $includeExtensions -contains $ext -or $includeExactNames -contains $name
    if (-not $include) { continue }

    $relativePath = Resolve-Path -Relative $file.FullName

    Add-Content -Path $outputFile -Value "=== START_FILE: $relativePath ==="
    Get-Content -Path $file.FullName -Raw | Add-Content -Path $outputFile
    Add-Content -Path $outputFile -Value "=== END_FILE: $relativePath ==="
    Add-Content -Path $outputFile -Value ""
}

Write-Host "Done. Bundled $($allFiles.Count) files into $outputFile"
Write-Host "File size:" (Get-Item $outputFile).Length "bytes"
