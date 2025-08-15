# 🚀 Fresh iOS Setup for Mack

## Overview
This is a complete React Native iOS app that connects to your NAS backend. All the files are ready - you just need to set it up on your Mac.

## 📋 Prerequisites
- **Mac with macOS** (required for iOS development)
- **Xcode** (latest version from Mac App Store)
- **Node.js** (v18 or higher)
- **CocoaPods** (will be installed automatically)

## 🏃‍♂️ Quick Setup (5 minutes)

### Step 1: Clone the Repository
```bash
git clone https://github.com/LCMilstein/watchlist-app.git
cd watchlist-app/WatchlistApp
cp -r * /Users/leemilstein/Documents/cinesync/
cd /Users/leemilstein/Documents/cinesync
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Install iOS Dependencies
```bash
cd ios
pod install
cd ..
```

### Step 4: Update API Endpoint
Edit `src/services/api.ts` and change the IP address to your NAS:
```typescript
const API_BASE = 'http://192.168.1.100:8008/api'; // Replace with your NAS IP
```

### Step 5: Run the App
```bash
npm start
```

In another terminal:
```bash
npm run ios
```

## 📱 What You'll Get
- ✅ **iOS Simulator** opens automatically
- ✅ **Watchlist interface** displays your movies/shows
- ✅ **Connects to your NAS** backend
- ✅ **Full functionality** - view, toggle watched status, delete items

## 🔧 If Something Goes Wrong

### "Command not found: pod"
```bash
sudo gem install cocoapods
```

### "Build failed"
```bash
cd ios
xcodebuild clean
cd ..
npx react-native start --reset-cache
```

### "Cannot connect to NAS"
- Check your NAS IP address in `src/services/api.ts`
- Make sure your NAS is running on port 8008
- Test: `curl http://your-nas-ip:8008/api/watchlist`

## 📁 File Structure
```
/Users/leemilstein/Documents/cinesync/
├── ios/                    # iOS native files
│   ├── WatchlistApp.xcodeproj
│   ├── Podfile
│   └── WatchlistApp/
│       ├── AppDelegate.h/mm
│       ├── Info.plist
│       └── [other iOS files]
├── src/                    # React Native source
│   ├── components/
│   ├── screens/
│   ├── services/
│   └── types/
├── App.tsx                 # Main app component
├── package.json            # Dependencies
└── [other config files]
```

## 🎯 Success Criteria
- ✅ App opens in iOS Simulator
- ✅ Shows watchlist from your NAS
- ✅ Can toggle watched status
- ✅ Can delete items
- ✅ No build errors

## 🆘 Need Help?
If you get stuck, check:
1. **Xcode is installed and updated**
2. **Node.js version**: `node --version` (should be 18+)
3. **NAS IP is correct** in `src/services/api.ts`
4. **NAS is running** and accessible

---

**That's it! The app should work immediately after these steps.** 🎉 