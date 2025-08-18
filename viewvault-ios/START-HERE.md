# 🚀 START HERE - React Native iOS App Setup

## What You Need to Do (3 Simple Steps)

### 1. 📖 Read the Quick Start Guide
Open `QUICK-START.md` and follow the instructions.

### 2. 🛠️ Run the Setup Script
```bash
./setup-mac.sh
```

### 3. ⚙️ Configure the API Endpoint
Edit `src/services/api.ts` and change the IP address:
```typescript
const API_BASE = 'http://YOUR_NAS_IP:8008/api';
```

## 🏃‍♂️ Run the App
```bash
npm start
npm run ios
```

## 📚 Need More Help?

- **`DEPLOYMENT.md`** - Complete deployment guide with troubleshooting
- **`MAC-SETUP.md`** - Detailed step-by-step instructions
- **`README.md`** - Full documentation

## 🔧 Common Issues

**"Permission denied"**
```bash
chmod +x setup-mac.sh
```

**"No such file or directory"**
- Make sure you're in the `ViewVaultApp` directory
- Run `npx react-native doctor`

**Build fails**
- Clean Xcode build folder
- Reset Metro cache: `npx react-native start --reset-cache`

## 📱 What You Get

- ✅ Native iOS interface for your watchlist
- ✅ View movies, series, and collections
- ✅ Toggle watched status
- ✅ Edit notes for items
- ✅ Pull-to-refresh functionality
- ✅ Dark theme matching your web app

---

**That's it! Start with `QUICK-START.md` and you'll be running in no time.** 🎉 