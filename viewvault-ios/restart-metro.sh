#!/bin/bash

echo "🔄 Stopping Metro bundler..."
pkill -f "react-native start" || true

echo "🧹 Clearing Metro cache..."
npx react-native start --reset-cache --max-workers=1 &

echo "⏳ Waiting for Metro to start..."
sleep 5

echo "✅ Metro should now be running on http://localhost:8081"
echo "📱 You can now run your app with: npm run ios"
