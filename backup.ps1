# TFL+ Workspace — Quick Backup Script
# Usage: คลิกขวาที่ไฟล์ → "Run with PowerShell"
#        หรือเปิด PowerShell แล้วรัน:  .\backup.ps1
#
# จะสร้าง zip ใน backups\tfl-workspace_<YYYY-MM-DD_HHMMSS>.zip
# พร้อม cleanup เก็บไว้ล่าสุด 20 ไฟล์ (เก่ากว่านั้นลบทิ้ง)

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$backupDir = Join-Path $root "backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$zip = Join-Path $backupDir "tfl-workspace_$stamp.zip"

$itemNames = @(
  "index.html",
  "package.json",
  "vercel.json",
  "README.md",
  "README-DATABASE.md",
  "DEPLOY.md",
  "firestore.rules",
  "api",
  "db",
  "scripts",
  "ws-light.png",
  "ws-dark.png",
  "lao-lottery.png"
)

$items = $itemNames | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }

if ($items.Count -eq 0) {
  Write-Host "✗ ไม่พบไฟล์โปรเจกต์ ตรวจสอบว่าวาง backup.ps1 ในโฟลเดอร์ tfl-workspace" -ForegroundColor Red
  Pause
  exit 1
}

Write-Host "→ กำลังสร้าง backup..." -ForegroundColor Cyan
Compress-Archive -Path $items -DestinationPath $zip -CompressionLevel Optimal -Force

$info = Get-Item $zip
Write-Host ""
Write-Host "✓ Backup สำเร็จ" -ForegroundColor Green
Write-Host ("  Path: " + $info.FullName)
Write-Host ("  Size: " + [math]::Round($info.Length / 1MB, 2) + " MB")
Write-Host ("  Date: " + $info.LastWriteTime)

# Cleanup — เก็บแค่ 20 backup ล่าสุด
$keep = 20
$all = Get-ChildItem -Path $backupDir -Filter "tfl-workspace_*.zip" | Sort-Object LastWriteTime -Descending
if ($all.Count -gt $keep) {
  $toDelete = $all | Select-Object -Skip $keep
  Write-Host ""
  Write-Host ("→ ลบ backup เก่า " + $toDelete.Count + " ไฟล์ (เก็บไว้ " + $keep + " ล่าสุด)") -ForegroundColor Yellow
  $toDelete | Remove-Item -Force
}

Write-Host ""
Write-Host "ปัจจุบันมี backup ทั้งหมด: " -NoNewline
Write-Host (Get-ChildItem -Path $backupDir -Filter "*.zip").Count -ForegroundColor Cyan
Write-Host ""
Read-Host "กด Enter เพื่อปิด"
