#!/bin/bash
# Deploy Migration Script to Remote Server
# This script helps deploy the database migration to fix the schema issue

echo "🚀 Deploying Database Migration to Remote Server"
echo "================================================"

# Configuration - UPDATE THESE VALUES
REMOTE_HOST="your-server-ip-or-domain"
REMOTE_USER="your-username"
REMOTE_PATH="/path/to/your/app"
REMOTE_DB_PATH="/path/to/your/database"

echo ""
echo "⚠️  BEFORE RUNNING THIS SCRIPT:"
echo "1. Update the configuration variables above"
echo "2. Ensure you have SSH access to the remote server"
echo "3. Make sure the remote server has Python 3 installed"
echo ""

# Check if configuration is updated
if [ "$REMOTE_HOST" = "your-server-ip-or-domain" ]; then
    echo "❌ Please update the configuration variables in this script first!"
    exit 1
fi

echo "📋 Configuration:"
echo "  Remote Host: $REMOTE_HOST"
echo "  Remote User: $REMOTE_USER"
echo "  Remote Path: $REMOTE_PATH"
echo "  Database Path: $REMOTE_DB_PATH"
echo ""

read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
fi

echo ""
echo "🔧 Step 1: Uploading migration script..."
scp remote_migration_fix.py "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

if [ $? -eq 0 ]; then
    echo "✅ Migration script uploaded successfully"
else
    echo "❌ Failed to upload migration script"
    exit 1
fi

echo ""
echo "🔧 Step 2: Running migration on remote server..."
ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_PATH && python3 remote_migration_fix.py"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "🔍 Next steps:"
    echo "1. Check if 'The Good Son' is now visible in your watchlist"
    echo "2. Try importing another movie to verify the fix"
    echo "3. If issues persist, check the remote server logs"
else
    echo ""
    echo "❌ Migration failed. Check the error output above."
    echo ""
    echo "🔍 Troubleshooting:"
    echo "1. Verify the remote server has Python 3 installed"
    echo "2. Check if the database path is correct"
    echo "3. Ensure the remote user has write permissions to the database"
fi

echo ""
echo "🏁 Deployment script completed."
