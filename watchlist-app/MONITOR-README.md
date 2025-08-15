# 🤖 Mack-Winnie Troubleshooting Monitor

This automated system monitors GitHub for updates to the troubleshooting document and responds to Mack's questions about the iOS app setup.

## 🚀 How It Works

1. **Mack asks a question** in `WatchlistApp/Mack - Winnie Troubleshooting.txt`
2. **Winnie (the monitor) detects** the question and generates a response
3. **Winnie updates** the document with the response
4. **Mack reads** the response and acts on it
5. **Process repeats** until the iOS app is working or 25 turns are reached

## 📋 Setup

### Prerequisites
- Python 3.6+
- `requests` package
- GitHub access (public repo or token)

### Installation

1. **Install Python dependencies**:
   ```bash
   pip3 install requests
   ```

2. **Set GitHub token** (optional, for private repos or higher rate limits):
   ```bash
   export GITHUB_TOKEN=your_github_token_here
   ```

3. **Make the script executable**:
   ```bash
   chmod +x start-mack-winnie-monitor.sh
   ```

## 🏃‍♂️ Running the Monitor

### Quick Start
```bash
./start-mack-winnie-monitor.sh
```

### Manual Start
```bash
python3 mack-winnie-monitor.py
```

## 📊 Monitor Features

- ✅ **Checks GitHub every 60 seconds** for updates
- ✅ **Detects Mack's questions** automatically
- ✅ **Generates contextual responses** based on question type
- ✅ **Updates the troubleshooting document** with responses
- ✅ **Tracks conversation turns** (max 25)
- ✅ **Handles common iOS setup issues**:
  - Xcode project file generation
  - Nested directory problems
  - Build errors
  - CocoaPods issues
  - General troubleshooting

## 🔧 Response Types

The monitor can generate responses for:

1. **Xcode Project Issues** - Help with `WatchlistApp.xcodeproj` generation
2. **Nested Directory Problems** - Fix directory structure issues
3. **Build Errors** - Troubleshoot compilation problems
4. **CocoaPods Issues** - Fix pod install problems
5. **General Questions** - General iOS setup help

## 📁 Files

- `mack-winnie-monitor.py` - Main monitoring script
- `start-mack-winnie-monitor.sh` - Startup script with checks
- `MONITOR-README.md` - This documentation

## 🎯 Goal

The joint goal is to solve Mack's iOS setup problems as quickly as possible with as few turns as possible, resulting in a working iOS app.

## 🔄 Conversation Flow

```
Mack → Asks question in document → Pushes to GitHub
Winnie → Detects question → Generates response → Updates document
Mack → Reads response → Acts on advice → Asks follow-up (if needed)
```

## 🛑 Stopping the Monitor

Press `Ctrl+C` to stop the monitor at any time.

## 📈 Monitoring Output

The monitor provides real-time feedback:
- Turn counting
- File update detection
- Response generation status
- Error handling

---

**Ready to help Mack get his iOS app running!** 🎉 