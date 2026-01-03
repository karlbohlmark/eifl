#!/usr/bin/env bash
set -euo pipefail

# EIFL Backup Script - B2 CLI Version
# Backups SQLite database and git repositories to Backblaze B2
# This version uses the B2 CLI directly (simpler and more reliable)

# Configuration
BACKUP_TYPE="${1:-hourly}"  # hourly or daily
BACKUP_DIR="/tmp/eifl-backup-$$"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# B2 Configuration (set these in your environment or .env)
: "${B2_BUCKET:?B2_BUCKET must be set}"
: "${B2_KEY_ID:?B2_KEY_ID must be set}"
: "${B2_APP_KEY:?B2_APP_KEY must be set}"

# Retention settings
HOURLY_RETENTION_DAYS=2
DAILY_RETENTION_DAYS=30

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Check if B2 CLI is installed
check_b2_cli() {
    if ! command -v b2 &> /dev/null; then
        log "ERROR: B2 CLI is not installed"
        log "Install with: pip install b2"
        log "Or: sudo apt-get install python3-pip && pip install b2"
        exit 1
    fi
}

# Authenticate with B2
b2_auth() {
    log "Authenticating with B2..."
    b2 account authorize "$B2_KEY_ID" "$B2_APP_KEY" > /dev/null 2>&1
    log "Authentication successful"
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

    log "Uploading $(basename "$backup_file") to B2: $b2_path"

    b2 file upload --quiet "$B2_BUCKET" "$backup_file" "$b2_path"

    log "Upload complete"
}

# Clean up old backups
cleanup_old_backups() {
    local prefix="$1"
    local retention_days="$2"

    log "Cleaning up backups older than $retention_days days (prefix: $prefix)..."

    local cutoff_timestamp=$(date -d "$retention_days days ago" +%s 2>/dev/null || date -v-${retention_days}d +%s)

    b2 ls --recursive "b2://${B2_BUCKET}/${prefix}" 2>/dev/null | while read -r line; do
        # Extract date from filename (format: YYYYMMDD-HHMMSS)
        if [[ "$line" =~ ([0-9]{8})-([0-9]{6}) ]]; then
            file_date="${BASH_REMATCH[1]}"
            file_time="${BASH_REMATCH[2]}"

            # Convert to timestamp for comparison
            file_timestamp=$(date -d "${file_date:0:4}-${file_date:4:2}-${file_date:6:2} ${file_time:0:2}:${file_time:2:2}:${file_time:4:2}" +%s 2>/dev/null || echo "0")

            if [ "$file_timestamp" -lt "$cutoff_timestamp" ]; then
                # Extract filename from line (last field)
                filename=$(echo "$line" | awk '{print $NF}')
                log "Deleting old backup: $filename"
                b2 rm "b2://${B2_BUCKET}/${filename}" || true
            fi
        fi
    done
}

# Main backup logic
main() {
    log "Starting $BACKUP_TYPE backup..."

    check_b2_cli
    b2_auth

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
