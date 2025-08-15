# WatchlistApp - React Native iOS App

This is the React Native iOS companion app for your watchlist application. It provides a native iOS interface for managing your watchlist, viewing details, and managing watched status.

## 📚 Documentation

- **[DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)** - Comprehensive guide for iOS developers (Mack)
- **[CINESYNC-SETUP.md](./CINESYNC-SETUP.md)** - Quick setup guide for the cinesync directory
- **[FRESH-START.md](./FRESH-START.md)** - Complete fresh start instructions
- **[GENERATE-PROJECT.md](./GENERATE-PROJECT.md)** - Xcode project generation guide

## Features

- 📱 **Native iOS Interface** - Built with React Native for optimal performance
- 🔐 **User Authentication** - Secure login and registration system
- 🎬 **Watchlist Management** - View all movies, series, and collections
- 📝 **Notes Support** - Add and edit notes for items
- ✅ **Watched Status** - Toggle watched status with visual indicators
- 🔄 **Pull-to-Refresh** - Refresh data from your NAS
- 🌙 **Dark Theme** - Matches your web app's design
- 📺 **Series Support** - View and manage individual episodes
- 🎭 **Collection Support** - Browse movies within collections

## 🔐 Authentication

**Important**: The iOS app now includes user authentication to match the web app's security system.

### First Time Setup
1. **Register a new account** using the registration form in the app
2. **Or use existing credentials** if you already have an account on the web app
3. **Login** with your username and password

### Authentication Flow
- App checks for stored authentication token on startup
- If no token found, shows login screen
- After successful login, token is stored and user sees watchlist
- If token expires or becomes invalid, user is redirected to login

### Troubleshooting Authentication
- **"Authentication required" error**: Your login session has expired. Please log in again.
- **"Failed to connect to server"**: Check your NAS IP address in `src/services/api.ts`
- **"Login failed"**: Verify your username and password are correct

## Prerequisites

### On Mac:
1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **Xcode** - Install from Mac App Store
3. **CocoaPods** - Run: `sudo gem install cocoapods`

## Quick Setup

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd watchlist-app/WatchlistApp
```

### 2. Install Dependencies
```bash
# Install npm dependencies
npm install

# Generate iOS project files
npx react-native init WatchlistApp --template react-native-template-typescript

# Install iOS dependencies
cd ios
pod install
cd ..
```

### 3. Configure the App

#### Update API Endpoint
Edit `src/services/api.ts` and update the API_BASE URL:
```typescript
const API_BASE = 'http://YOUR_NAS_IP:8008/api'; // Replace with your NAS IP
```

#### Configure iOS Network Security
Add to `ios/WatchlistApp/Info.plist`:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

#### Update Bundle Identifier
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

## Project Structure

```
WatchlistApp/
├── src/
│   ├── components/
│   │   └── WatchlistItem.tsx    # Reusable item component
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Authentication screen
│   │   ├── WatchlistScreen.tsx  # Main watchlist view
│   │   └── DetailsScreen.tsx    # Item details view
│   ├── services/
│   │   └── api.ts              # Backend communication
│   └── types/
│       └── index.ts            # TypeScript definitions
├── App.tsx                     # Main app with navigation
├── package.json                # Dependencies
└── README.md                  # This file
```

## API Integration

The app connects to your existing FastAPI backend:

- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration
- `GET /api/watchlist` - Get all watchlist data
- `POST /api/watchlist/{type}/{id}/toggle` - Toggle watched status
- `PATCH /api/{type}s/{id}/notes` - Save notes
- `DELETE /api/watchlist/{type}/{id}` - Delete items
- `POST /api/series/{id}/episodes/{season}/{episode}/toggle` - Toggle episode status

## Troubleshooting

### Common Issues

1. **"No such file or directory" errors**
   - Make sure you're in the WatchlistApp directory
   - Run `npx react-native doctor` to check your setup

2. **Pod install fails**
   - Update CocoaPods: `sudo gem update cocoapods`
   - Clean and reinstall: `cd ios && pod deintegrate && pod install`

3. **Build fails**
   - Clean Xcode build: Product → Clean Build Folder
   - Reset Metro cache: `npx react-native start --reset-cache`

4. **Network connection issues**
   - Ensure your NAS is accessible from your Mac
   - Check firewall settings
   - Verify the IP address in the API configuration

5. **Authentication issues**
   - Make sure you're using the same credentials as the web app
   - Check that your NAS backend is running and accessible
   - Verify the API endpoint URL is correct

### Development Commands

```bash
# Start Metro bundler
npm start

# Run on iOS simulator
npm run ios

# Run on Android (if configured)
npm run android

# Lint code
npm run lint

# Run tests
npm test
```

## Next Steps

1. ✅ Test basic watchlist display
2. ✅ Verify API connectivity
3. ✅ Test authentication system
4. ✅ Test details screen functionality
5. 🔄 Add search and import features
6. 🔄 Implement offline caching
7. 🔄 Add push notifications
8. 🔄 Polish UI and animations

## Notes

- The app requires your NAS to be running and accessible
- Make sure to update the API_BASE URL to match your NAS IP address
- The app uses the same API endpoints as your web application
- All data is fetched from your existing FastAPI backend
- **Authentication is required** - users must log in to access the watchlist

## 🤝 For Developers

If you're working on this iOS app (like Mack), please see:

- **[DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)** - Comprehensive development guide
- **[CINESYNC-SETUP.md](./CINESYNC-SETUP.md)** - Quick setup for the cinesync directory
- **[FRESH-START.md](./FRESH-START.md)** - Complete fresh start instructions

The codebase includes comprehensive comments and TypeScript types to help you understand and extend the functionality. 