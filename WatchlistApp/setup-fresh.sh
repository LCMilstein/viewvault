#!/bin/bash

# Fresh iOS Setup Script for Mack
# This script sets up the React Native iOS app from scratch

set -e

echo "🚀 Fresh iOS Setup for Mack"
echo "============================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the cinesync directory"
    echo "   cd /Users/leemilstein/Documents/cinesync"
    echo "   ./setup-fresh.sh"
    exit 1
fi

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode is not installed. Please install Xcode from the Mac App Store"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Install iOS dependencies
echo "📱 Installing iOS dependencies..."
cd ios
pod install
cd ..

echo "✅ Dependencies installed"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update the API endpoint in src/services/api.ts with your NAS IP"
echo "2. Run the app:"
echo "   npm start"
echo "   npm run ios"
echo ""
echo "📚 For more details, see FRESH-START.md" 