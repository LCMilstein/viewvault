# 🎬 CineSync iOS Setup Guide

## Quick Setup (5 minutes)

### Step 1: Clone and Copy Files
```bash
git clone https://github.com/LCMilstein/watchlist-app.git
cd watchlist-app/WatchlistApp
cp -r * /Users/leemilstein/Documents/cinesync/
cd /Users/leemilstein/Documents/cinesync
```

### Step 2: Run Setup Script
```bash
chmod +x setup-cinesync.sh
./setup-cinesync.sh
```

### Step 3: Update NAS IP
Edit `src/services/api.ts` and change the IP address:
```typescript
const API_BASE = 'http://192.168.1.100:8008/api'; // Replace with your NAS IP
```

### Step 4: Run the App
```bash
npm start
```

In another terminal:
```bash
npm run ios
```

## ✅ What You'll Get
- iOS Simulator opens automatically
- Watchlist interface shows your movies/shows
- Connects to your NAS backend
- Full functionality (view, toggle watched, delete)

## 🔧 If Something Goes Wrong
- **"Command not found: pod"**: `sudo gem install cocoapods`
- **"Build failed"**: `cd ios && xcodebuild clean && cd .. && npx react-native start --reset-cache`
- **"Cannot connect to NAS"**: Check your NAS IP in `src/services/api.ts`

---

**That's it! The app should work immediately.** 🎉 