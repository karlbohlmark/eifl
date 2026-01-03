#!/usr/bin/env bash
set -euo pipefail

# EIFL Backup Cron Setup Script
# Sets up automated backups for EIFL

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Check if AWS CLI is installed
check_dependencies() {
    if ! command -v aws &> /dev/null; then
        echo "ERROR: AWS CLI is not installed"
        echo "Install with: sudo apt-get install awscli"
        echo "Or: pip install awscli"
        exit 1
    fi

    if ! command -v sqlite3 &> /dev/null; then
        echo "ERROR: sqlite3 is not installed"
        echo "Install with: sudo apt-get install sqlite3"
        exit 1
    fi

    log "Dependencies check passed"
}

# Create environment file for cron
create_cron_env() {
    local env_file="$SCRIPT_DIR/.backup-env"

    log "Creating environment file for cron jobs..."

    echo "Please enter your Backblaze B2 credentials:"
    read -p "B2 Bucket Name: " b2_bucket
    read -p "B2 Endpoint (e.g., https://s3.us-west-004.backblazeb2.com): " b2_endpoint
    read -p "B2 Key ID: " b2_key_id
    read -sp "B2 Application Key: " b2_app_key
    echo ""

    cat > "$env_file" <<EOF
# Backblaze B2 Configuration for EIFL Backups
export B2_BUCKET="$b2_bucket"
export B2_ENDPOINT="$b2_endpoint"
export B2_KEY_ID="$b2_key_id"
export B2_APP_KEY="$b2_app_key"
export PATH="/usr/local/bin:/usr/bin:/bin"
EOF

    chmod 600 "$env_file"
    log "Environment file created: $env_file"
}

# Generate cron entries
generate_cron_entries() {
    cat <<EOF

# EIFL Automated Backups
# Hourly: Database only (every hour at :15)
15 * * * * . $SCRIPT_DIR/.backup-env && $SCRIPT_DIR/backup.sh hourly >> /var/log/eifl-backup.log 2>&1

# Daily: Full backup (every day at 2:30 AM)
30 2 * * * . $SCRIPT_DIR/.backup-env && $SCRIPT_DIR/backup.sh daily >> /var/log/eifl-backup.log 2>&1
EOF
}

# Setup systemd timer (alternative to cron)
setup_systemd_timer() {
    local service_dir="$HOME/.config/systemd/user"
    mkdir -p "$service_dir"

    # Hourly backup service
    cat > "$service_dir/eifl-backup-hourly.service" <<EOF
[Unit]
Description=EIFL Hourly Database Backup
After=network.target

[Service]
Type=oneshot
EnvironmentFile=$SCRIPT_DIR/.backup-env
ExecStart=$SCRIPT_DIR/backup.sh hourly
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

    # Hourly backup timer
    cat > "$service_dir/eifl-backup-hourly.timer" <<EOF
[Unit]
Description=EIFL Hourly Backup Timer
Requires=eifl-backup-hourly.service

[Timer]
OnCalendar=hourly
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Daily backup service
    cat > "$service_dir/eifl-backup-daily.service" <<EOF
[Unit]
Description=EIFL Daily Full Backup
After=network.target

[Service]
Type=oneshot
EnvironmentFile=$SCRIPT_DIR/.backup-env
ExecStart=$SCRIPT_DIR/backup.sh daily
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

    # Daily backup timer
    cat > "$service_dir/eifl-backup-daily.timer" <<EOF
[Unit]
Description=EIFL Daily Backup Timer
Requires=eifl-backup-daily.service

[Timer]
OnCalendar=daily
OnCalendar=02:30
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable eifl-backup-hourly.timer
    systemctl --user enable eifl-backup-daily.timer
    systemctl --user start eifl-backup-hourly.timer
    systemctl --user start eifl-backup-daily.timer

    log "Systemd timers installed and started"
    log "Check status with: systemctl --user status eifl-backup-*.timer"
}

# Main setup
main() {
    echo "=== EIFL Backup Setup ==="
    echo ""

    check_dependencies
    create_cron_env

    echo ""
    echo "Choose backup scheduler:"
    echo "1) Cron (traditional, works everywhere)"
    echo "2) Systemd timers (modern, better logging)"
    read -p "Selection (1/2): " choice

    case "$choice" in
        1)
            log "Setting up cron jobs..."
            echo ""
            echo "Add these lines to your crontab (crontab -e):"
            generate_cron_entries
            echo ""
            log "Don't forget to create log directory: sudo touch /var/log/eifl-backup.log && sudo chown $USER /var/log/eifl-backup.log"
            ;;
        2)
            log "Setting up systemd timers..."
            setup_systemd_timer
            ;;
        *)
            echo "Invalid selection"
            exit 1
            ;;
    esac

    echo ""
    log "Setup complete!"
    log "Test backup with: $SCRIPT_DIR/backup.sh hourly"
}

main "$@"
