# EIFL Backup & Restore

Automated backup strategy for EIFL using Backblaze B2 cloud storage.

## Overview

**What's backed up:**
- SQLite database (`data/eifl.db`) - contains all projects, repos, pipelines, builds, metrics
- Git repositories (`data/repos/`) - bare git repositories

**Backup schedule:**
- **Hourly**: Database only (~200KB) - captures build history, pipeline runs
- **Daily**: Full backup (database + repos) - comprehensive snapshot

**Retention policy:**
- Hourly backups: 2 days (48 snapshots)
- Daily backups: 30 days (30 snapshots)

**Storage cost estimate:**
- ~$0.006/GB/month on Backblaze B2
- With ~5MB daily backup = ~$0.03/month

## Setup

### 1. Install Dependencies

```bash
# AWS CLI (for S3-compatible B2 access)
sudo apt-get install awscli

# SQLite3 (for database backups)
sudo apt-get install sqlite3
```

### 2. Create Backblaze B2 Account

1. Sign up at https://www.backblaze.com/b2
2. Create a bucket (e.g., `eifl-backups`)
3. Create an application key:
   - Go to App Keys → Add a New Application Key
   - Save the **Key ID** and **Application Key** (shown only once!)
4. Note your S3 endpoint (e.g., `https://s3.us-west-004.backblazeb2.com`)
   - Find this in: Buckets → Bucket Settings → Endpoint

### 3. Configure Automated Backups

Run the setup script:

```bash
./scripts/setup-cron.sh
```

This will:
- Prompt for your B2 credentials
- Create environment file for backup jobs
- Set up automated backups (cron or systemd)

### 4. Test Backup

Run a manual backup to verify everything works:

```bash
# Set B2 credentials (one-time for testing)
export B2_BUCKET="your-bucket-name"
export B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com"
export B2_KEY_ID="your-key-id"
export B2_APP_KEY="your-app-key"

# Run hourly backup (database only)
./scripts/backup.sh hourly

# Run daily backup (full)
./scripts/backup.sh daily
```

## Manual Backup

To create a one-off backup:

```bash
# Database only
./scripts/backup.sh hourly

# Full backup (database + repos)
./scripts/backup.sh daily
```

## Restore

### List Available Backups

```bash
./scripts/restore.sh --list
```

### Interactive Restore

```bash
./scripts/restore.sh --interactive
```

This will:
1. Show available backups
2. Prompt you to select a backup
3. Download and extract the backup
4. Create safety backup of current data
5. Restore database and repositories

### Direct Restore

If you know the backup filename:

```bash
./scripts/restore.sh --restore daily/eifl-full-20250101-120000.tar.gz
```

### Important: Stop Server Before Restore

```bash
# Find and stop the EIFL server process
pkill -f "bun.*src/index.ts"

# Or if using systemd
systemctl --user stop eifl

# Then restore
./scripts/restore.sh --interactive

# Restart server
bun run start
```

## Monitoring

### Check Backup Status

**Using cron:**
```bash
# View backup logs
tail -f /var/log/eifl-backup.log
```

**Using systemd:**
```bash
# Check timer status
systemctl --user status eifl-backup-hourly.timer
systemctl --user status eifl-backup-daily.timer

# View recent backup logs
journalctl --user -u eifl-backup-hourly.service -n 50
journalctl --user -u eifl-backup-daily.service -n 50
```

### Verify Backups in B2

```bash
# List hourly backups
aws s3 ls s3://your-bucket/hourly/ --endpoint-url https://s3.us-west-004.backblazeb2.com

# List daily backups
aws s3 ls s3://your-bucket/daily/ --endpoint-url https://s3.us-west-004.backblazeb2.com
```

## Disaster Recovery

### Complete System Loss

1. **Install EIFL** on new system:
   ```bash
   git clone <your-repo>
   cd eifl
   bun install
   ```

2. **Set up B2 credentials** in environment:
   ```bash
   export B2_BUCKET="your-bucket"
   export B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com"
   export B2_KEY_ID="your-key-id"
   export B2_APP_KEY="your-app-key"
   ```

3. **List and restore latest backup**:
   ```bash
   ./scripts/restore.sh --list
   ./scripts/restore.sh --restore daily/eifl-full-YYYYMMDD-HHMMSS.tar.gz
   ```

4. **Restore .env file** (you should have this backed up separately or in your git repo)

5. **Start server**:
   ```bash
   bun run start
   ```

### Database Corruption

If the database becomes corrupted but repos are fine:

```bash
# Stop server
pkill -f "bun.*src/index.ts"

# Restore latest hourly backup (more recent than daily)
./scripts/restore.sh --restore hourly/eifl-db-YYYYMMDD-HHMMSS.tar.gz

# Restart server
bun run start
```

### Accidental Data Deletion

Hourly backups provide point-in-time recovery:

1. Find the backup from before the deletion
2. Restore using the interactive tool
3. Choose the appropriate hourly backup

## Security Notes

- **B2 credentials**: Stored in `scripts/.backup-env` with 600 permissions (owner-only)
- **.env file**: Included in backups but not encrypted (as requested)
- **Consider**: Storing `.backup-env` in a password manager as a backup
- **Git repos**: Backed up as-is (if they contain secrets, they'll be in backups)

## Troubleshooting

### Backup fails with "VACUUM INTO failed"

Database might be locked:
```bash
# Check if EIFL is running
pgrep -f "bun.*src/index.ts"

# If running during hourly backup, this is normal
# Backups are designed to work while server is running
```

### AWS CLI not found

```bash
# Install AWS CLI
sudo apt-get install awscli

# Or using pip
pip install awscli
```

### B2 authentication errors

Check your credentials:
```bash
# Test B2 connection
aws s3 ls s3://your-bucket/ --endpoint-url $B2_ENDPOINT
```

### No backups appear in B2

Check the backup log:
```bash
tail -f /var/log/eifl-backup.log
```

Common issues:
- Wrong bucket name
- Wrong endpoint URL
- Invalid credentials
- Network connectivity

## Cost Management

### Estimate Storage Costs

Current backup size:
```bash
# Check database size
ls -lh data/eifl.db

# Check repos size
du -sh data/repos
```

Monthly storage estimate:
- Hourly: 48 backups × DB size
- Daily: 30 backups × (DB + repos) size
- Example: (48 × 200KB) + (30 × 5MB) = ~160MB = **$0.001/month**

### Adjust Retention

Edit `scripts/backup.sh`:
```bash
# Change these values
HOURLY_RETENTION_DAYS=2   # Default: 2 days
DAILY_RETENTION_DAYS=30   # Default: 30 days
```

## Alternative Cloud Providers

The scripts use S3-compatible API, so you can easily switch to:

**AWS S3:**
```bash
export B2_BUCKET="your-bucket"
export B2_ENDPOINT="https://s3.amazonaws.com"
export B2_KEY_ID="your-aws-access-key"
export B2_APP_KEY="your-aws-secret-key"
```

**Cloudflare R2:**
```bash
export B2_BUCKET="your-bucket"
export B2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
export B2_KEY_ID="your-r2-access-key"
export B2_APP_KEY="your-r2-secret-key"
```

**MinIO (self-hosted):**
```bash
export B2_BUCKET="eifl-backups"
export B2_ENDPOINT="https://minio.yourdomain.com"
export B2_KEY_ID="your-minio-access-key"
export B2_APP_KEY="your-minio-secret-key"
```
