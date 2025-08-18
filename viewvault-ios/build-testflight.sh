#!/bin/bash

# Build script for TestFlight distribution
echo "🚀 Building CineSync for TestFlight..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
cd ios
xcodebuild clean -workspace WatchlistApp.xcworkspace -scheme WatchlistApp

# Install pods
echo "📦 Installing CocoaPods..."
pod install

# Build for release
echo "🔨 Building for release..."
xcodebuild archive \
  -workspace WatchlistApp.xcworkspace \
  -scheme WatchlistApp \
  -configuration Release \
  -archivePath build/WatchlistApp.xcarchive \
  -destination generic/platform=iOS

echo "✅ Build complete! Archive created at: ios/build/WatchlistApp.xcarchive"
echo ""
echo "📱 Next steps:"
echo "1. Open Xcode"
echo "2. Go to Window > Organizer"
echo "3. Select the archive and click 'Distribute App'"
echo "4. Choose 'App Store Connect'"
echo "5. Follow the distribution wizard"
echo ""
echo "🎯 Your app is ready for TestFlight!" 