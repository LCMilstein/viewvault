#!/bin/bash

# Fixed iOS Setup Script for WatchlistApp
# This script sets up the iOS project without creating nested directories

set -e

echo "🚀 Setting up iOS project for WatchlistApp..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the WatchlistApp directory"
    echo "   cd WatchlistApp"
    echo "   ./setup-ios-fix.sh"
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

# Check CocoaPods
if ! command -v pod &> /dev/null; then
    echo "📦 Installing CocoaPods..."
    sudo gem install cocoapods
fi

echo "✅ Prerequisites check passed"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check if iOS directory exists and has content
if [ ! -d "ios" ] || [ -z "$(ls -A ios 2>/dev/null)" ]; then
    echo "📱 iOS directory is empty or missing. Creating iOS project structure..."
    
    # Create iOS directory structure
    mkdir -p ios/WatchlistApp
    
    echo "✅ iOS project structure created"
else
    echo "✅ iOS directory already exists"
fi

# Install iOS dependencies
echo "📦 Installing iOS dependencies..."
cd ios
pod install
cd ..

echo "✅ iOS dependencies installed"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update the API endpoint in src/services/api.ts with your NAS IP"
echo "2. Open ios/WatchlistApp.xcworkspace in Xcode"
echo "3. Update the Bundle Identifier in Xcode if needed"
echo "4. Run the app:"
echo "   npm start"
echo "   npm run ios"
echo ""
echo "📚 For more details, see README.md" 