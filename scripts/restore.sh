#!/usr/bin/env bash
set -euo pipefail

# EIFL Restore Script
# Restores SQLite database and git repositories from Backblaze B2

# Configuration
RESTORE_DIR="/tmp/eifl-restore-$$"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

# B2 Configuration (set these in your environment or .env)
: "${B2_BUCKET:?B2_BUCKET must be set}"
: "${B2_ENDPOINT:?B2_ENDPOINT must be set}"
: "${B2_KEY_ID:?B2_KEY_ID must be set}"
: "${B2_APP_KEY:?B2_APP_KEY must be set}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# List available backups
list_backups() {
    local backup_type="${1:-all}"

    echo "=== Available Backups ==="
    echo ""

    if [ "$backup_type" = "all" ] || [ "$backup_type" = "hourly" ]; then
        echo "Hourly (database only):"
        AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
        aws s3 ls "s3://${B2_BUCKET}/hourly/" --endpoint-url "$B2_ENDPOINT" | \
            tail -10 | awk '{print "  " $4 " (" $3 ")"}'
        echo ""
    fi

    if [ "$backup_type" = "all" ] || [ "$backup_type" = "daily" ]; then
        echo "Daily (full backup):"
        AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
        aws s3 ls "s3://${B2_BUCKET}/daily/" --endpoint-url "$B2_ENDPOINT" | \
            tail -10 | awk '{print "  " $4 " (" $3 ")"}'
        echo ""
    fi
}

# Download backup from B2
download_backup() {
    local backup_path="$1"
    local local_file="$2"

    log "Downloading backup from B2: $backup_path"

    AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
    aws s3 cp "s3://${B2_BUCKET}/${backup_path}" "$local_file" \
        --endpoint-url "$B2_ENDPOINT" \
        --no-progress

    log "Download complete: $(du -h "$local_file" | cut -f1)"
}

# Restore from backup
restore_backup() {
    local backup_file="$1"

    # Create restore directory
    mkdir -p "$RESTORE_DIR"
    trap "rm -rf $RESTORE_DIR" EXIT

    # Extract backup
    log "Extracting backup..."
    tar -xzf "$backup_file" -C "$RESTORE_DIR"

    # Stop EIFL server before restoring (optional safety check)
    if pgrep -f "bun.*src/index.ts" > /dev/null; then
        echo "WARNING: EIFL server appears to be running!"
        echo "It's recommended to stop the server before restoring."
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Restore cancelled"
            exit 1
        fi
    fi

    # Backup current data (just in case)
    if [ -f "$DATA_DIR/eifl.db" ]; then
        SAFETY_BACKUP="$DATA_DIR/eifl.db.pre-restore.$(date +%Y%m%d-%H%M%S)"
        log "Creating safety backup of current database: $SAFETY_BACKUP"
        cp "$DATA_DIR/eifl.db" "$SAFETY_BACKUP"
    fi

    # Restore database
    if [ -f "$RESTORE_DIR/eifl.db" ]; then
        log "Restoring database..."
        mkdir -p "$DATA_DIR"
        cp "$RESTORE_DIR/eifl.db" "$DATA_DIR/eifl.db"

        # Remove WAL files to force checkpoint
        rm -f "$DATA_DIR/eifl.db-wal" "$DATA_DIR/eifl.db-shm"

        log "Database restored"
    fi

    # Restore repositories (if present in backup)
    if [ -f "$RESTORE_DIR/repos.tar.gz" ]; then
        log "Restoring git repositories..."

        if [ -d "$DATA_DIR/repos" ]; then
            REPOS_BACKUP="$DATA_DIR/repos.pre-restore.$(date +%Y%m%d-%H%M%S)"
            log "Backing up existing repos to: $REPOS_BACKUP"
            mv "$DATA_DIR/repos" "$REPOS_BACKUP"
        fi

        tar -xzf "$RESTORE_DIR/repos.tar.gz" -C "$DATA_DIR"
        log "Repositories restored"
    fi

    log "Restore complete!"
    log "You can now start the EIFL server"
}

# Interactive restore
interactive_restore() {
    echo "=== EIFL Restore ==="
    echo ""

    # List backups
    list_backups

    echo ""
    read -p "Enter backup type (hourly/daily): " backup_type
    read -p "Enter backup filename: " backup_filename

    # Construct full path
    backup_path="${backup_type}/${backup_filename}"

    # Download backup
    local_backup="$RESTORE_DIR/${backup_filename}"
    mkdir -p "$RESTORE_DIR"
    download_backup "$backup_path" "$local_backup"

    # Restore
    restore_backup "$local_backup"
}

# Usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -l, --list [TYPE]        List available backups (hourly/daily/all)"
    echo "  -r, --restore PATH       Restore from specific backup path (e.g., daily/eifl-full-20250101-120000.tar.gz)"
    echo "  -i, --interactive        Interactive restore (default)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --list"
    echo "  $0 --restore daily/eifl-full-20250101-120000.tar.gz"
    echo "  $0 --interactive"
}

# Main
main() {
    case "${1:-}" in
        -l|--list)
            list_backups "${2:-all}"
            ;;
        -r|--restore)
            if [ -z "${2:-}" ]; then
                echo "ERROR: Backup path required"
                usage
                exit 1
            fi
            local_backup="$RESTORE_DIR/backup.tar.gz"
            mkdir -p "$RESTORE_DIR"
            download_backup "$2" "$local_backup"
            restore_backup "$local_backup"
            ;;
        -i|--interactive|"")
            interactive_restore
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "ERROR: Unknown option: $1"
            usage
            exit 1
            ;;
    esac
}

main "$@"
