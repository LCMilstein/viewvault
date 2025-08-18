# Watchlist iOS App

A React Native iOS application for managing your movie and TV show watchlist. Connects to a NAS backend API for data persistence.

## 🚀 Features

- **Authentication**: Username/password login with Bearer token support
- **Watchlist Management**: View, toggle watched status, and delete items
- **Modern UI**: Clean, dark-themed interface optimized for iOS
- **Real-time Sync**: Connects to your NAS backend for data persistence
- **iOS Native**: Built specifically for iOS with native performance

## 📱 Screenshots

- Login screen with username/password authentication
- Watchlist view with movie/show cards
- Detail view for individual items
- Toggle watched status functionality

## 🛠 Tech Stack

- **React Native**: 0.73.x
- **TypeScript**: Full type safety
- **React Navigation**: Screen navigation
- **iOS Simulator**: Development and testing
- **CocoaPods**: iOS dependency management

## 📋 Prerequisites

- macOS with Xcode 15+
- Node.js 18+
- CocoaPods
- iOS Simulator or physical device

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd cinesync
```

### 2. Install Dependencies
```bash
npm install
cd ios && pod install && cd ..
```

### 3. Configure API Endpoint
Edit `src/services/api.ts` and update the API base URL:
```typescript
const API_BASE = 'https://your-api-domain.com/api';
```

### 4. Run the App
```bash
# Start Metro bundler
npm start

# In another terminal, run iOS app
npm run ios
```

## 🔧 Configuration

### API Configuration
The app connects to a backend API that requires:
- **Login Endpoint**: `POST /api/auth/login`
- **Watchlist Endpoint**: `GET /api/watchlist`
- **Authentication**: Bearer token (automatically handled)

### Environment Setup
1. **Xcode**: Ensure Xcode is installed and updated
2. **iOS Simulator**: Available through Xcode
3. **CocoaPods**: `sudo gem install cocoapods`

## 📁 Project Structure

```
cinesync/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Authentication screen
│   │   ├── WatchlistScreen.tsx  # Main watchlist view
│   │   └── DetailsScreen.tsx    # Item detail view
│   ├── services/
│   │   └── api.ts              # API service layer
│   └── types/
│       └── index.ts            # TypeScript definitions
├── ios/                        # iOS native files
├── App.tsx                     # Main app component
├── package.json               # Dependencies
└── README.md                  # This file
```

## 🔐 Authentication Flow

1. **Login Screen**: User enters username/password
2. **API Call**: App calls `/api/auth/login` with credentials
3. **Token Storage**: API returns Bearer token, app stores it
4. **Authenticated Requests**: All subsequent requests include Bearer token
5. **Navigation**: User is taken to watchlist on successful login

## 🐛 Troubleshooting

### Common Issues

**Build Errors:**
```bash
cd ios && xcodebuild clean && cd ..
npx react-native start --reset-cache
```

**CocoaPods Issues:**
```bash
cd ios && pod install --repo-update
```

**Metro Cache:**
```bash
npx react-native start --reset-cache
```

**iOS Simulator Issues:**
- Ensure Xcode is up to date
- Reset simulator: iOS Simulator → Device → Erase All Content and Settings

### Network Issues
- Verify API endpoint is accessible
- Check authentication credentials
- Ensure proper HTTPS/SSL configuration

## 📝 Development

### Adding New Features
1. Create new screen in `src/screens/`
2. Add navigation route in `App.tsx`
3. Update API service if needed
4. Test on iOS Simulator

### Code Style
- TypeScript for type safety
- Functional components with hooks
- Consistent naming conventions
- Proper error handling

## 🚀 Deployment

### Building for Production
```bash
cd ios
xcodebuild -workspace WatchlistApp.xcworkspace -scheme WatchlistApp -configuration Release -destination generic/platform=iOS -archivePath WatchlistApp.xcarchive archive
```

### App Store Distribution
1. Configure signing in Xcode
2. Archive the app
3. Upload to App Store Connect
4. Submit for review

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Ensure all prerequisites are met

---

**Built with ❤️ using React Native and TypeScript** 