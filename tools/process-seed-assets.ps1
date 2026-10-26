param(
  # Committed originals. Pass another folder to ingest replacement masters.
  [string]$SourceDirectory = (Join-Path $PSScriptRoot '..\data\assets\source'),
  [string]$RepositoryRoot = (Join-Path $PSScriptRoot '..')
)

# Rebuilds the runtime scenario media served by the static app from the
# original masters, and records SHA-256 provenance for both.
# Requires ImageMagick (magick) and ffmpeg on PATH.

$ErrorActionPreference = 'Stop'
$RepositoryRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
$SourceDirectory = [System.IO.Path]::GetFullPath($SourceDirectory)
$sourceRoot = Join-Path $RepositoryRoot 'data\assets\source'
$sourceApparatus = Join-Path $sourceRoot 'apparatus'
$seedRoot = Join-Path $RepositoryRoot 'apps\web\public\scenario-assets\seed'
$runtimeApparatus = Join-Path $seedRoot 'apparatus'

foreach ($directory in @($sourceRoot, $sourceApparatus, $seedRoot, $runtimeApparatus)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$mapSource = Join-Path $SourceDirectory 'aerial_view_for_house_fire.png'
$videoSource = Join-Path $SourceDirectory 'house_fire_video.mp4'
if (!(Test-Path -LiteralPath $mapSource) -or !(Test-Path -LiteralPath $videoSource)) {
  throw 'The map or initial-conditions video master is missing.'
}

if ($SourceDirectory -ne $sourceRoot) {
  Copy-Item -LiteralPath $mapSource -Destination (Join-Path $sourceRoot 'aerial_view_for_house_fire.png') -Force
  Copy-Item -LiteralPath $videoSource -Destination (Join-Path $sourceRoot 'house_fire_video.mp4') -Force
}

& magick $mapSource -colorspace sRGB -depth 8 -quality 92 (Join-Path $seedRoot 'background.webp')
if ($LASTEXITCODE -ne 0) { throw 'Map WebP conversion failed.' }
& magick $mapSource -colorspace sRGB -resize '640x640>' -depth 8 -quality 84 (Join-Path $seedRoot 'background-thumb.webp')
if ($LASTEXITCODE -ne 0) { throw 'Map thumbnail conversion failed.' }

foreach ($designation in @('E1', 'E2', 'E3', 'E4', 'L1', 'L3')) {
  $source = Join-Path $SourceDirectory "apparatus\$designation.png"
  if (!(Test-Path -LiteralPath $source)) { $source = Join-Path $SourceDirectory "$designation.png" }
  if (!(Test-Path -LiteralPath $source)) { throw "Missing apparatus master: $designation" }
  if ($SourceDirectory -ne $sourceRoot) { Copy-Item -LiteralPath $source -Destination (Join-Path $sourceApparatus "$designation.png") -Force }
  # Drop near-transparent fringe, trim, pad, then a 1000 px tall alpha WebP.
  & magick $source -channel A -fx 'u < 0.02 ? 0 : u' +channel -trim +repage -bordercolor none -border 16 -resize 'x1000>' -quality 90 -define webp:alpha-quality=95 -define webp:method=6 (Join-Path $runtimeApparatus "$designation.webp")
  if ($LASTEXITCODE -ne 0) { throw "Apparatus processing failed for $designation." }
}

& ffmpeg -hide_banner -loglevel error -y -i $videoSource -map '0:v:0' -vf 'scale=1920:1080:flags=lanczos,fps=30' -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags '+faststart' -an (Join-Path $seedRoot 'initial-conditions.mp4')
if ($LASTEXITCODE -ne 0) { throw 'Video optimization failed.' }
& ffmpeg -hide_banner -loglevel error -y -ss 3 -i $videoSource -frames:v 1 -vf 'scale=1280:720:flags=lanczos' (Join-Path $seedRoot 'initial-conditions-poster.png')
if ($LASTEXITCODE -ne 0) { throw 'Video poster extraction failed.' }
& magick (Join-Path $seedRoot 'initial-conditions-poster.png') -quality 88 (Join-Path $seedRoot 'initial-conditions-poster.webp')
if ($LASTEXITCODE -ne 0) { throw 'Video poster conversion failed.' }
Remove-Item -LiteralPath (Join-Path $seedRoot 'initial-conditions-poster.png') -Force

$manifestPath = Join-Path $seedRoot 'manifest.json'
$manifest = @($sourceRoot, $seedRoot) | ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Recurse } | Where-Object { $_.FullName -ne $manifestPath } | ForEach-Object {
  [ordered]@{
    path = $_.FullName.Substring($RepositoryRoot.Length + 1).Replace('\', '/')
    bytes = $_.Length
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
