# Quick Start - React Native iOS App

## 🚀 One-Command Setup

After cloning your repository on Mac:

```bash
cd watchlist-app/WatchlistApp
./setup-mac.sh
```

## 📝 Configuration Required

1. **Update API endpoint** in `src/services/api.ts`:
   ```typescript
   const API_BASE = 'http://YOUR_NAS_IP:8008/api';
   ```

2. **Optional**: Update bundle identifier in Xcode

## 🏃‍♂️ Run the App

```bash
npm start
npm run ios
```

## 📱 What You Get

- ✅ Native iOS interface for your watchlist
- ✅ View movies, series, and collections
- ✅ Toggle watched status
- ✅ Edit notes for items
- ✅ Pull-to-refresh functionality
- ✅ Dark theme matching your web app

## 🔧 Troubleshooting

- **Permission denied**: `chmod +x setup-mac.sh`
- **Build fails**: Clean Xcode build folder
- **Network issues**: Check NAS IP in api.ts

## 📚 More Info

- See `README.md` for detailed documentation
- See `MAC-SETUP.md` for step-by-step guide
- See `PROGRESS.md` for development status 