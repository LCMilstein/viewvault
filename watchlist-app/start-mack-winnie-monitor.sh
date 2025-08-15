#!/bin/bash

# Mack-Winnie Troubleshooting Monitor Startup Script
# This script starts the automated troubleshooting conversation between Mack and Winnie

echo "🤖 Starting Mack-Winnie Troubleshooting Monitor"
echo "================================================"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Check if required packages are installed
echo "📦 Checking required packages..."
python3 -c "import requests" 2>/dev/null || {
    echo "📦 Installing requests package..."
    pip3 install requests
}

# Check if GitHub token is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  Warning: GITHUB_TOKEN environment variable is not set."
    echo "   The monitor will work with public repos, but may have rate limits."
    echo "   To set a token: export GITHUB_TOKEN=your_token_here"
    echo ""
fi

# Check if the monitor script exists
if [ ! -f "mack-winnie-monitor.py" ]; then
    echo "❌ mack-winnie-monitor.py not found in current directory"
    exit 1
fi

echo "✅ All checks passed!"
echo ""
echo "🚀 Starting monitor..."
echo "   - Will check GitHub every 60 seconds"
echo "   - Max 25 turns between Mack and Winnie"
echo "   - Monitoring: WatchlistApp/Mack - Winnie Troubleshooting.txt"
echo ""
echo "Press Ctrl+C to stop the monitor"
echo ""

# Start the monitor
python3 mack-winnie-monitor.py 