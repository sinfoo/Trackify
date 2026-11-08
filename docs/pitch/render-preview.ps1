# Renders a deck to <preview dir>/slide-NN.png using the installed PowerPoint.
# Usage: powershell -ExecutionPolicy Bypass -File render-preview.ps1 [-Deck Trackify-pitch] 
param([string]$Deck = "Trackify-pitch")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pptx = Join-Path $here "$Deck.pptx"
$out = Join-Path $here ($(if ($Deck -eq "Trackify-pitch") { "preview" } else { "preview-" + ($Deck -replace "^Trackify-pitch-", "") }))
$lock = Join-Path $here ('~$' + $Deck + '.pptx')
New-Item -ItemType Directory -Force $out | Out-Null

# An unlicensed PowerPoint sometimes ignores Quit and keeps the deck open; clear any such instance first.
Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "$Deck*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
if (Test-Path $lock) { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
Get-ChildItem $out -Filter *.png | Remove-Item -Force

$before = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$app = New-Object -ComObject PowerPoint.Application
try {
    $pres = $app.Presentations.Open($pptx, $true, $false, $false)  # ReadOnly, Untitled, WithWindow
    $pres.Export($out, "PNG", 1920, 1080)
    $pres.Close()
} finally {
    $quit = $false
    for ($i = 0; $i -lt 5 -and -not $quit; $i++) {
        try { $app.Quit(); $quit = $true } catch { Start-Sleep -Milliseconds 800 }
    }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
    # Verify the instance we started is really gone; kill it if Quit was ignored.
    for ($i = 0; $i -lt 10; $i++) {
        $mine = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id })
        if ($mine.Count -eq 0) { break }
        if ($i -ge 2) { $mine | Stop-Process -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 500
    }
    if (Test-Path $lock) { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
}
# PowerPoint names files Slide1.PNG ... ; normalise to slide-01.png
Get-ChildItem $out -Filter "Slide*.PNG" | ForEach-Object {
    $n = [int]($_.BaseName -replace "\D", "")
    Move-Item $_.FullName (Join-Path $out ("slide-{0:D2}.png" -f $n)) -Force
}
Get-ChildItem $out -Filter "slide-*.png" | Select-Object -ExpandProperty Name
