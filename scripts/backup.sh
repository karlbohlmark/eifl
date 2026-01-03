#!/usr/bin/env bash
set -euo pipefail

# EIFL Backup Script
# Backups SQLite database and git repositories to Backblaze B2

# Configuration
BACKUP_TYPE="${1:-hourly}"  # hourly or daily
BACKUP_DIR="/tmp/eifl-backup-$$"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# B2 Configuration (set these in your environment or .env)
: "${B2_BUCKET:?B2_BUCKET must be set}"
: "${B2_ENDPOINT:?B2_ENDPOINT must be set}"  # e.g., https://s3.us-west-004.backblazeb2.com
: "${B2_KEY_ID:?B2_KEY_ID must be set}"
: "${B2_APP_KEY:?B2_APP_KEY must be set}"

# Retention settings
HOURLY_RETENTION_DAYS=2
DAILY_RETENTION_DAYS=30

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Create temporary backup directory
mkdir -p "$BACKUP_DIR"
trap "rm -rf $BACKUP_DIR" EXIT

# Backup SQLite database
backup_database() {
    log "Backing up SQLite database..."

    # Use SQLite's VACUUM INTO for a consistent backup
    sqlite3 "$DATA_DIR/eifl.db" "VACUUM INTO '$BACKUP_DIR/eifl.db'"

    log "Database backup complete: $(du -h "$BACKUP_DIR/eifl.db" | cut -f1)"
}

# Backup git repositories
backup_repos() {
    log "Backing up git repositories..."

    if [ -d "$DATA_DIR/repos" ] && [ "$(ls -A "$DATA_DIR/repos" 2>/dev/null)" ]; then
        tar -czf "$BACKUP_DIR/repos.tar.gz" -C "$DATA_DIR" repos
        log "Repos backup complete: $(du -h "$BACKUP_DIR/repos.tar.gz" | cut -f1)"
    else
        log "No repositories to backup"
    fi
}

# Upload to B2
upload_to_b2() {
    local backup_file="$1"
    local b2_path="$2"

    log "Uploading $backup_file to B2: $b2_path"

    # Use AWS CLI with B2 S3-compatible API
    AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
    aws s3 cp "$backup_file" "s3://${B2_BUCKET}/${b2_path}" \
        --endpoint-url "$B2_ENDPOINT" \
        --no-progress

    log "Upload complete"
}

# Clean up old backups
cleanup_old_backups() {
    local prefix="$1"
    local retention_days="$2"

    log "Cleaning up backups older than $retention_days days (prefix: $prefix)..."

    local cutoff_date=$(date -d "$retention_days days ago" +%Y%m%d 2>/dev/null || date -v-${retention_days}d +%Y%m%d)

    AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
    aws s3 ls "s3://${B2_BUCKET}/${prefix}" --endpoint-url "$B2_ENDPOINT" | \
    while read -r line; do
        # Extract date from filename (format: YYYYMMDD-HHMMSS)
        file_date=$(echo "$line" | grep -oP '\d{8}' | head -1)
        filename=$(echo "$line" | awk '{print $4}')

        if [ -n "$file_date" ] && [ "$file_date" -lt "$cutoff_date" ]; then
            log "Deleting old backup: $filename"
            AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
            AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
            aws s3 rm "s3://${B2_BUCKET}/${prefix}${filename}" --endpoint-url "$B2_ENDPOINT"
        fi
    done
}

# Main backup logic
main() {
    log "Starting $BACKUP_TYPE backup..."

    case "$BACKUP_TYPE" in
        hourly)
            backup_database

            # Create compressed archive
            BACKUP_ARCHIVE="$BACKUP_DIR/eifl-db-${TIMESTAMP}.tar.gz"
            tar -czf "$BACKUP_ARCHIVE" -C "$BACKUP_DIR" eifl.db

            # Upload to B2
            upload_to_b2 "$BACKUP_ARCHIVE" "hourly/eifl-db-${TIMESTAMP}.tar.gz"

            # Cleanup old hourly backups
            cleanup_old_backups "hourly/" "$HOURLY_RETENTION_DAYS"
            ;;

        daily)
            backup_database
            backup_repos

            # Create compressed archive
            BACKUP_ARCHIVE="$BACKUP_DIR/eifl-full-${TIMESTAMP}.tar.gz"
            tar -czf "$BACKUP_ARCHIVE" -C "$BACKUP_DIR" .

            # Upload to B2
            upload_to_b2 "$BACKUP_ARCHIVE" "daily/eifl-full-${TIMESTAMP}.tar.gz"

            # Cleanup old daily backups
            cleanup_old_backups "daily/" "$DAILY_RETENTION_DAYS"
            ;;

        *)
            log "ERROR: Invalid backup type: $BACKUP_TYPE (must be 'hourly' or 'daily')"
            exit 1
            ;;
    esac

    log "Backup complete!"
}

main
