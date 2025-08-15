# Deployment Guide for WatchlistApp

## 🚀 Quick Start (Recommended)

**For Mac users who want to get the iOS app running quickly:**

1. **Read:** `QUICK-START.md` - One-page quick start guide
2. **Run:** `./setup-mac.sh` - Automated setup script
3. **Configure:** Update API endpoint in `src/services/api.ts`

## 📚 Detailed Documentation

### For Mac Setup:
- **`MAC-SETUP.md`** - Step-by-step Mac setup guide
- **`README.md`** - Comprehensive documentation with troubleshooting

### For Understanding the App:
- **`PROGRESS.md`** - What's implemented and what's planned
- **`ios-setup.md`** - Technical iOS setup details

## 🔧 Common Issues & Solutions

### "Permission denied" when running setup script
```bash
chmod +x setup-mac.sh
./setup-mac.sh
```

### "No such file or directory" errors
- Make sure you're in the `WatchlistApp` directory
- Run `npx react-native doctor` to check your setup

### Pod install fails
```bash
sudo gem update cocoapods
cd ios && pod deintegrate && pod install && cd ..
```

### Build fails
- Clean Xcode build: Product → Clean Build Folder
- Reset Metro cache: `npx react-native start --reset-cache`

### Network connection issues
- Verify your NAS IP address in `src/services/api.ts`
- Ensure your NAS is running and accessible
- Check firewall settings

## 📱 What You Get

The iOS app includes:
- ✅ **Watchlist Screen** - View all your movies, series, and collections
- ✅ **Details Screen** - View item details and edit notes
- ✅ **Watched Status** - Toggle watched status with visual indicators
- ✅ **Pull-to-Refresh** - Refresh data from your NAS
- ✅ **Dark Theme** - Matches your web app design

## 🎯 Next Steps

1. ✅ Test the basic watchlist display
2. ✅ Verify API connectivity
3. ✅ Test the details screen functionality
4. 🔄 Add search and import features
5. 🔄 Implement offline caching
6. 🔄 Add push notifications

## 📞 Support

If you're still having issues:
1. Check the troubleshooting sections in the guides above
2. Verify your NAS is running and accessible
3. Ensure the API endpoint is correctly configured
4. Make sure you have Node.js, Xcode, and CocoaPods installed 