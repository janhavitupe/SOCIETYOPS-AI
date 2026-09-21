$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $PSScriptRoot "..\backups"
$backupFile = Join-Path $backupDir "societyops-$timestamp.sql.gz"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl) {
    Write-Error "DATABASE_URL environment variable is not set"
    exit 1
}

Write-Host "Starting backup: $backupFile"

if ($env:BACKUP_PROVIDER -eq "aws" -and $env:BACKUP_BUCKET) {
    $tempFile = Join-Path $backupDir "societyops-$timestamp.sql"
    pg_dump $databaseUrl | Out-File -FilePath $tempFile -Encoding utf8
    Compress-Archive -Path $tempFile -DestinationPath "$tempFile.gz" -Force
    aws s3 cp "$tempFile.gz" "s3://$env:BACKUP_BUCKET/backups/societyops-$timestamp.sql.gz"
    Remove-Item $tempFile, "$tempFile.gz"
    Write-Host "Backup uploaded to S3"
} elseif ($env:BACKUP_PROVIDER -eq "gcs" -and $env:BACKUP_BUCKET) {
    $tempFile = Join-Path $backupDir "societyops-$timestamp.sql"
    pg_dump $databaseUrl | Out-File -FilePath $tempFile -Encoding utf8
    gzip $tempFile
    gcloud storage cp "$tempFile.gz" "gs://$env:BACKUP_BUCKET/backups/societyops-$timestamp.sql.gz"
    Remove-Item "$tempFile.gz"
    Write-Host "Backup uploaded to GCS"
} else {
    pg_dump $databaseUrl | gzip > $backupFile
    Write-Host "Backup saved locally: $backupFile"
}

$retentionDays = 30
$cutoff = (Get-Date).AddDays(-$retentionDays)
Get-ChildItem $backupDir -Filter "societyops-*.sql.gz" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item
Write-Host "Backup completed. Files older than $retentionDays days removed."
