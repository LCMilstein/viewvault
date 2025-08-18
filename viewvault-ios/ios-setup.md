# iOS Setup Instructions

Once you have Node.js installed, follow these steps to complete the iOS setup:

## 1. Generate iOS Project Files

Run the React Native CLI to generate the iOS project structure:

```bash
npx react-native init WatchlistApp --template react-native-template-typescript
```

This will create the complete iOS project structure including:
- `ios/WatchlistApp.xcworkspace`
- `ios/WatchlistApp/Info.plist`
- `ios/Podfile`
- And other necessary iOS files

## 2. Install iOS Dependencies

```bash
cd ios
pod install
cd ..
```

## 3. Configure App

### Update Bundle Identifier
In Xcode, open `ios/WatchlistApp.xcworkspace` and:
1. Select the project in the navigator
2. Select the "WatchlistApp" target
3. In the "General" tab, update the Bundle Identifier to something unique like `com.yourname.watchlistapp`

### Configure Network Security
Add the following to `ios/WatchlistApp/Info.plist` to allow HTTP connections to your NAS:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

## 4. Update API Configuration

Edit `src/services/api.ts` and update the API_BASE URL to match your NAS IP:

```typescript
const API_BASE = 'http://192.168.1.100:8008/api'; // Replace with your NAS IP
```

## 5. Run the App

```bash
# Start Metro bundler
npm start

# In another terminal, run iOS app
npm run ios
```

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
   - Ensure your NAS is accessible from your development machine
   - Check firewall settings
   - Verify the IP address in the API configuration

## Next Steps

1. Test the basic watchlist display
2. Verify API connectivity
3. Test the details screen functionality
4. Add search and import features
5. Implement offline caching
6. Add push notifications
7. Polish the UI and animations 