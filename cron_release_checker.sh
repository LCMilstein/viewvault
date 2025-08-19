#!/bin/bash

# Nightly Release Checker Script
# This script should be run via cron to check for new releases
# Example cron entry: 0 2 * * * /app/cron_release_checker.sh

# Set the working directory to the app directory
cd /app

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Load environment variables
if [ -f "secrets.env" ]; then
    export $(cat secrets.env | xargs)
fi

# Run the release checker
echo "$(date): Starting nightly release check..." >> /app/release_checker.log
python release_checker.py >> /app/release_checker.log 2>&1
echo "$(date): Nightly release check completed." >> /app/release_checker.log

# Optional: Send notification to admin (if you have email setup)
# echo "Release check completed at $(date)" | mail -s "Watchlist Release Check" admin@example.com 