#!/bin/bash

# WatchlistApp iOS Setup Script for Mac
# This script will set up the React Native iOS app on macOS

set -e

echo "🚀 Setting up WatchlistApp for iOS..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the WatchlistApp directory"
    echo "   cd WatchlistApp"
    echo "   ./setup-mac.sh"
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

# Generate iOS project files if they don't exist
if [ ! -d "ios" ] || [ -z "$(ls -A ios 2>/dev/null)" ]; then
    echo "📱 Generating iOS project files..."
    npx react-native init WatchlistApp --template react-native-template-typescript
    echo "✅ iOS project files generated"
else
    echo "✅ iOS project files already exist"
fi

# Install iOS dependencies
echo "📦 Installing iOS dependencies..."
cd ios
pod install
cd ..

echo "✅ iOS dependencies installed"

# Create Info.plist if it doesn't exist
if [ ! -f "ios/WatchlistApp/Info.plist" ]; then
    echo "📝 Creating Info.plist..."
    mkdir -p ios/WatchlistApp
    cat > ios/WatchlistApp/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>WatchlistApp</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
</dict>
</plist>
EOF
    echo "✅ Info.plist created"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update the API endpoint in src/services/api.ts with your NAS IP"
echo "2. Open ios/WatchlistApp.xcworkspace in Xcode"
echo "3. Update the Bundle Identifier in Xcode"
echo "4. Run the app:"
echo "   npm start"
echo "   npm run ios"
echo ""
echo "📚 For more details, see README.md" 