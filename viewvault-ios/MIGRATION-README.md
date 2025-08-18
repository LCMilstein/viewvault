# Database Schema Migration Guide

## 🚨 Issue Summary

**"The Good Son" import appears to succeed but the movie is invisible in watchlists.**

**Root Cause:** The remote server's database is missing the `user_id` column in the `movie` and `series` tables, causing imported movies to have no user association and therefore not display in watchlists.

## 🔍 What I Found

1. **"The Good Son" IS in the remote database** (ID 990, IMDB tt0107034)
2. **But it's missing the `user_id` field** - so it's invisible to users
3. **The import succeeds** - movie gets added to database
4. **But the movie is invisible** - because it has no user association

## 🛠️ Solution

Run the database migration script on the remote server to add the missing `user_id` columns.

## 📁 Files Created

- **`remote_migration_fix.py`** - Python script to fix the database schema
- **`deploy_migration.sh`** - Bash script to deploy and run the migration
- **`MIGRATION-README.md`** - This guide

## 🚀 Quick Fix (Option 1: Manual Upload)

### Step 1: Upload the migration script
```bash
# Copy the script to your remote server
scp remote_migration_fix.py username@your-server:/path/to/app/
```

### Step 2: Run the migration
```bash
# SSH into your server and run the script
ssh username@your-server
cd /path/to/app
python3 remote_migration_fix.py
```

## 🚀 Automated Fix (Option 2: Use Deployment Script)

### Step 1: Update configuration
Edit `deploy_migration.sh` and update these variables:
```bash
REMOTE_HOST="your-server-ip-or-domain"
REMOTE_USER="your-username"
REMOTE_PATH="/path/to/your/app"
REMOTE_DB_PATH="/path/to/your/database"
```

### Step 2: Run deployment
```bash
chmod +x deploy_migration.sh
./deploy_migration.sh
```

## 🔧 What the Migration Does

1. **Checks current database schema** for missing columns
2. **Adds `user_id` column** to `movie` table if missing
3. **Adds `user_id` column** to `series` table if missing
4. **Verifies the fix** by checking updated schema
5. **Shows movie data** to confirm "The Good Son" exists

## ✅ Expected Results

After running the migration:
- Database will have the correct schema with `user_id` columns
- "The Good Son" should become visible in your watchlist
- Future movie imports should work correctly
- All existing movies will have `user_id` set (initially NULL, but can be updated)

## 🚨 Important Notes

- **Backup your database** before running the migration
- **Test on a staging environment** first if possible
- **Ensure the remote server has Python 3** installed
- **Verify database permissions** for the user running the script

## 🔍 Verification

After migration, verify the fix by:
1. Checking if "The Good Son" appears in your watchlist
2. Trying to import another movie
3. Checking the database schema on the remote server

## 📞 If Issues Persist

1. Check remote server logs for errors
2. Verify database file permissions
3. Ensure Python 3 is installed on the remote server
4. Check if the database path in the script is correct

## 🎯 Next Steps

Once the migration is complete:
1. **Test the fix** by checking your watchlist
2. **Import a new movie** to verify the process works
3. **Update existing movies** with proper user_id values if needed
4. **Monitor the system** to ensure no new issues arise

---

**Created by:** Mack (AI Assistant)  
**Issue:** Database schema mismatch causing invisible movie imports  
**Solution:** Add missing `user_id` columns to database tables
