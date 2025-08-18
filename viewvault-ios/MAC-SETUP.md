# Mac Setup Guide for WatchlistApp

This guide will help you set up the React Native iOS app on your Mac in just a few steps.

## Prerequisites

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **Xcode** - Install from Mac App Store
3. **CocoaPods** - Will be installed automatically by the setup script

## Quick Setup

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd watchlist-app/WatchlistApp
```

### 2. Run the Setup Script
```bash
./setup-mac.sh
```

This script will:
- ✅ Check prerequisites (Node.js, Xcode, CocoaPods)
- ✅ Install npm dependencies
- ✅ Generate iOS project files
- ✅ Install iOS dependencies
- ✅ Create necessary configuration files

### 3. Configure the App

#### Update API Endpoint
Copy the example API file and update it with your NAS IP:

```bash
cp src/services/api.example.ts src/services/api.ts
```

Then edit `src/services/api.ts` and change the IP address:
```typescript
const API_BASE = 'http://YOUR_NAS_IP:8008/api'; // Replace with your NAS IP
```

#### Update Bundle Identifier (Optional)
1. Open `ios/WatchlistApp.xcworkspace` in Xcode
2. Select the project in the navigator
3. Select the "WatchlistApp" target
4. In the "General" tab, update Bundle Identifier to something unique like `com.yourname.watchlistapp`

### 4. Run the App
```bash
# Start Metro bundler
npm start

# In another terminal, run iOS app
npm run ios
```

## Troubleshooting

### Common Issues

**"Permission denied" when running setup script**
```bash
chmod +x setup-mac.sh
./setup-mac.sh
```

**"No such file or directory" errors**
- Make sure you're in the WatchlistApp directory
- Run `npx react-native doctor` to check your setup

**Pod install fails**
```bash
sudo gem update cocoapods
cd ios && pod deintegrate && pod install && cd ..
```

**Build fails**
- Clean Xcode build: Product → Clean Build Folder
- Reset Metro cache: `npx react-native start --reset-cache`

**Network connection issues**
- Verify your NAS IP address in `src/services/api.ts`
- Ensure your NAS is running and accessible
- Check firewall settings

## What's Included

The app includes:
- 📱 **Watchlist Screen** - View all your movies, series, and collections
- 📝 **Details Screen** - View item details and edit notes
- ✅ **Watched Status** - Toggle watched status with visual indicators
- 🔄 **Pull-to-Refresh** - Refresh data from your NAS
- 🌙 **Dark Theme** - Matches your web app design

## Next Steps

1. ✅ Test the basic watchlist display
2. ✅ Verify API connectivity
3. ✅ Test the details screen functionality
4. 🔄 Add search and import features
5. 🔄 Implement offline caching
6. 🔄 Add push notifications

## Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Verify your NAS is running and accessible
3. Ensure the API endpoint is correctly configured
4. Check the main README.md for more detailed information 