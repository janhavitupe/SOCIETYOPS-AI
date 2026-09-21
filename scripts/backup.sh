#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$(dirname "$0")/../backups"
BACKUP_FILE="$BACKUP_DIR/societyops-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Starting backup: $BACKUP_FILE"

if [ "${BACKUP_PROVIDER:-}" = "aws" ] && [ -n "${BACKUP_BUCKET:-}" ]; then
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/societyops-$TIMESTAMP.sql"
  gzip "$BACKUP_DIR/societyops-$TIMESTAMP.sql"
  aws s3 cp "$BACKUP_DIR/societyops-$TIMESTAMP.sql.gz" "s3://$BACKUP_BUCKET/backups/societyops-$TIMESTAMP.sql.gz"
  echo "Backup uploaded to S3"
elif [ "${BACKUP_PROVIDER:-}" = "gcs" ] && [ -n "${BACKUP_BUCKET:-}" ]; then
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/societyops-$TIMESTAMP.sql"
  gzip "$BACKUP_DIR/societyops-$TIMESTAMP.sql"
  gcloud storage cp "$BACKUP_DIR/societyops-$TIMESTAMP.sql.gz" "gs://$BACKUP_BUCKET/backups/societyops-$TIMESTAMP.sql.gz"
  echo "Backup uploaded to GCS"
else
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
  echo "Backup saved locally: $BACKUP_FILE"
fi

find "$BACKUP_DIR" -name "societyops-*.sql.gz" -mtime +30 -delete
echo "Backup completed. Files older than 30 days removed."
