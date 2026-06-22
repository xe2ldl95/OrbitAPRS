param(
    [Parameter(Mandatory=$true)]
    [string]$NewVersion
)

$OldVersion = (Select-String -Path "$PSScriptRoot\sw.js" -Pattern "orbitaprs-v([\d.]+)").Matches[0].Groups[1].Value
if (-not $OldVersion) { Write-Error "Could not detect current version from sw.js"; exit 1 }

Write-Host "Bumping $OldVersion -> $NewVersion in index.html and sw.js"

foreach ($f in @("$PSScriptRoot\index.html", "$PSScriptRoot\sw.js")) {
    (Get-Content $f -Raw) -replace $OldVersion, $NewVersion | Set-Content $f -NoNewline
}

Write-Host "Done. Run 'git diff' to verify."
