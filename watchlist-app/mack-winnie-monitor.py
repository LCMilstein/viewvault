#!/usr/bin/env python3
"""
Mack-Winnie Troubleshooting Monitor
Automatically monitors GitHub for updates to the troubleshooting document
and responds to Mack's questions about the iOS app setup.
"""

import os
import time
import requests
import json
import subprocess
import re
from datetime import datetime
from pathlib import Path

# Configuration
REPO_OWNER = "LCMilstein"
REPO_NAME = "watchlist-app"
TROUBLESHOOTING_FILE = "WatchlistApp/Mack - Winnie Troubleshooting.txt"
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', '')  # Set this environment variable
MAX_TURNS = 25
CHECK_INTERVAL = 60  # seconds

class MackWinnieMonitor:
    def __init__(self):
        self.turn_count = 0
        self.last_commit_sha = None
        self.session = requests.Session()
        if GITHUB_TOKEN:
            self.session.headers.update({
                'Authorization': f'token {GITHUB_TOKEN}',
                'Accept': 'application/vnd.github.v3+json'
            })
    
    def get_file_content(self):
        """Fetch the current content of the troubleshooting file from GitHub"""
        from urllib.parse import quote
        encoded_path = quote(TROUBLESHOOTING_FILE)
        url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{encoded_path}"
        try:
            response = self.session.get(url)
            if response.status_code == 200:
                content = response.json()
                import base64
                file_content = base64.b64decode(content['content']).decode('utf-8')
                return file_content, content['sha']
            else:
                print(f"Failed to fetch file: {response.status_code}")
                return None, None
        except Exception as e:
            print(f"Error fetching file: {e}")
            return None, None
    
    def update_file_content(self, new_content, commit_message):
        """Update the troubleshooting file on GitHub"""
        from urllib.parse import quote
        encoded_path = quote(TROUBLESHOOTING_FILE)
        url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{encoded_path}"
        
        # Get current file to get the SHA
        current_response = self.session.get(url)
        if current_response.status_code != 200:
            print("Failed to get current file SHA")
            return False
        
        current_file = current_response.json()
        
        # Prepare the update
        import base64
        data = {
            "message": commit_message,
            "content": base64.b64encode(new_content.encode()).decode(),
            "sha": current_file['sha']
        }
        
        try:
            response = self.session.put(url, json=data)
            if response.status_code in [200, 201]:
                print(f"Successfully updated file: {commit_message}")
                return True
            else:
                print(f"Failed to update file: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"Error updating file: {e}")
            return False
    
    def analyze_mack_question(self, content):
        """Analyze Mack's question and generate a response"""
        # Look for Mack's questions in the content
        lines = content.split('\n')
        mack_questions = []
        
        for i, line in enumerate(lines):
            if "Mack's Question:" in line or "Mack:" in line:
                # Find the question content
                question_start = i
                question_end = i + 1
                while question_end < len(lines) and not lines[question_end].startswith('## Winnie'):
                    question_end += 1
                
                question = '\n'.join(lines[question_start:question_end])
                mack_questions.append(question)
        
        if not mack_questions:
            return None
        
        # Generate response based on the question
        latest_question = mack_questions[-1]
        
        if "Xcode project" in latest_question or "WatchlistApp.xcodeproj" in latest_question:
            return self.generate_xcode_response()
        elif "nested directories" in latest_question:
            return self.generate_nested_dir_response()
        elif "build" in latest_question or "compile" in latest_question:
            return self.generate_build_response()
        elif "pod install" in latest_question:
            return self.generate_pod_response()
        else:
            return self.generate_general_response(latest_question)
    
    def generate_xcode_response(self):
        """Generate response for Xcode project issues"""
        return """
## Winnie's Response:

Hey Mack! I see you're still having issues with the Xcode project file. Let me give you a more direct approach:

### 🚀 Direct Solution:

1. **Create a fresh React Native project** (this will give you the proper Xcode files):
   ```bash
   cd ~/Desktop  # or wherever you want to create it
   npx react-native init WatchlistAppTemp --template react-native-template-typescript
   ```

2. **Copy the iOS files to your existing project**:
   ```bash
   cp -r WatchlistAppTemp/ios/* /path/to/your/watchlist-app/WatchlistApp/ios/
   rm -rf WatchlistAppTemp
   ```

3. **Install dependencies**:
   ```bash
   cd /path/to/your/watchlist-app/WatchlistApp
   npm install
   cd ios && pod install && cd ..
   ```

### 🔧 Alternative: Manual Xcode Project

If the above doesn't work:
1. Open Xcode
2. File → New → Project → iOS → App
3. Name it "WatchlistApp"
4. Save it in your `ios/` directory
5. Copy the source files I created into the project

### 📁 What You Should Have:
- `ios/WatchlistApp.xcodeproj`
- `ios/WatchlistApp.xcworkspace` (after pod install)
- All the source files in `ios/WatchlistApp/`

Let me know if you're still getting errors! 🎯
"""
    
    def generate_nested_dir_response(self):
        """Generate response for nested directory issues"""
        return """
## Winnie's Response:

Hey Mack! The nested directory issue is happening because React Native CLI creates a new project structure. Here's the fix:

### 🛠️ Clean Solution:

1. **Remove any nested directories**:
   ```bash
   rm -rf WatchlistApp/WatchlistApp/
   rm -rf ios/WatchlistApp/WatchlistApp/
   ```

2. **Generate iOS files in a temp location**:
   ```bash
   mkdir temp_ios
   cd temp_ios
   npx react-native init WatchlistApp --template react-native-template-typescript --skip-install
   ```

3. **Copy only the iOS files**:
   ```bash
   cp -r WatchlistApp/ios/* ../WatchlistApp/ios/
   cd ..
   rm -rf temp_ios
   ```

4. **Install dependencies**:
   ```bash
   cd WatchlistApp
   npm install
   cd ios && pod install && cd ..
   ```

This way you get the Xcode project files without the nested structure! 🎉
"""
    
    def generate_build_response(self):
        """Generate response for build issues"""
        return """
## Winnie's Response:

Hey Mack! Build issues are common. Let's troubleshoot:

### 🔧 Build Fixes:

1. **Clean everything**:
   ```bash
   cd ios
   xcodebuild clean
   cd ..
   npx react-native start --reset-cache
   ```

2. **Check your setup**:
   ```bash
   npx react-native doctor
   ```

3. **Update dependencies**:
   ```bash
   npm install
   cd ios && pod install && cd ..
   ```

4. **Check Xcode version**:
   - Make sure you have the latest Xcode
   - Open Xcode and accept any license agreements

5. **Check your API endpoint**:
   - Make sure `src/services/api.ts` has the correct NAS IP
   - Test connectivity to your NAS

### 📱 Common Build Errors:

**"No such module"**: Run `pod install` again
**"Build failed"**: Clean Xcode build folder
**"Metro bundler issues"**: Reset cache with `npx react-native start --reset-cache`

What specific error are you seeing? 🤔
"""
    
    def generate_pod_response(self):
        """Generate response for CocoaPods issues"""
        return """
## Winnie's Response:

Hey Mack! CocoaPods issues are fixable. Here's what to do:

### 📦 Pod Install Fixes:

1. **Update CocoaPods**:
   ```bash
   sudo gem update cocoapods
   ```

2. **Clean and reinstall**:
   ```bash
   cd ios
   pod deintegrate
   pod install
   cd ..
   ```

3. **If that doesn't work**:
   ```bash
   cd ios
   rm -rf Pods
   rm Podfile.lock
   pod install
   cd ..
   ```

4. **Check your Ruby version**:
   ```bash
   ruby --version
   ```
   If it's old, consider using rbenv or rvm.

5. **Alternative: Use Homebrew**:
   ```bash
   brew install cocoapods
   ```

### 🔧 Common Pod Errors:

**"Permission denied"**: Use `sudo` or fix permissions
**"Gem not found"**: Update Ruby gems
**"Network error"**: Check your internet connection

Let me know what specific pod error you're getting! 🛠️
"""
    
    def generate_general_response(self, question):
        """Generate a general response for other questions"""
        return f"""
## Winnie's Response:

Hey Mack! I see your question about the iOS setup. Let me help you get this working.

### 🚀 General Troubleshooting:

1. **Make sure you're in the right directory**:
   ```bash
   cd WatchlistApp
   pwd  # Should show .../watchlist-app/WatchlistApp
   ```

2. **Check your prerequisites**:
   - Node.js (v18+): `node --version`
   - Xcode: Make sure it's installed and updated
   - CocoaPods: `pod --version`

3. **Try the complete setup again**:
   ```bash
   npm install
   cd ios && pod install && cd ..
   npm start
   ```

4. **In another terminal**:
   ```bash
   npm run ios
   ```

### 📱 What should work:
- The app should open in iOS Simulator
- You should see the watchlist interface
- It should connect to your NAS (after updating the API endpoint)

### 🔧 If it's still not working:
Can you tell me:
1. What specific error you're seeing?
2. What step you're stuck on?
3. What your current directory structure looks like?

I'm here to help you get this running! 🎯
"""
    
    def run(self):
        """Main monitoring loop"""
        print("🤖 Mack-Winnie Troubleshooting Monitor Started")
        print(f"📁 Monitoring: {TROUBLESHOOTING_FILE}")
        print(f"⏰ Check interval: {CHECK_INTERVAL} seconds")
        print(f"🔄 Max turns: {MAX_TURNS}")
        print("=" * 50)
        
        while self.turn_count < MAX_TURNS:
            try:
                # Check for updates
                content, current_sha = self.get_file_content()
                
                if content and current_sha != self.last_commit_sha:
                    print(f"\n🔄 Turn {self.turn_count + 1}: File updated detected!")
                    print(f"📝 Last commit: {current_sha[:8]}")
                    
                    # Analyze for Mack's questions
                    response = self.analyze_mack_question(content)
                    
                    if response:
                        # Add response to the file
                        new_content = content + f"\n\n{response}\n"
                        
                        # Update the file
                        commit_msg = f"Winnie's response to Mack - Turn {self.turn_count + 1}"
                        if self.update_file_content(new_content, commit_msg):
                            self.turn_count += 1
                            self.last_commit_sha = current_sha
                            print(f"✅ Response sent! Turn {self.turn_count}/{MAX_TURNS}")
                        else:
                            print("❌ Failed to update file")
                    else:
                        print("ℹ️ No new questions detected from Mack")
                        self.last_commit_sha = current_sha
                else:
                    print(f"⏳ Waiting for updates... (Turn {self.turn_count + 1}/{MAX_TURNS})")
                
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                print("\n🛑 Monitor stopped by user")
                break
            except Exception as e:
                print(f"❌ Error in monitoring loop: {e}")
                time.sleep(CHECK_INTERVAL)
        
        print(f"\n🏁 Monitor finished after {self.turn_count} turns")

if __name__ == "__main__":
    monitor = MackWinnieMonitor()
    monitor.run() 