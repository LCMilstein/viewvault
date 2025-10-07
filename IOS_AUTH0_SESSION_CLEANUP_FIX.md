# iOS Auth0 Session Cleanup Fix

---

## 🚨 **NEW REQUEST TO BACKEND TEAM - CRITICAL ISSUE**

**Date**: Current  
**Issue**: Login-after-logout still failing with "active transaction" error  
**Status**: URGENT - Previous fixes implemented but core issue persists  

### **Current Status**
✅ **LOGOUT FIXED**: Logout now works properly (no more Auth0 error page)  
❌ **LOGIN STILL BROKEN**: Still getting "Failed to start this transaction, as there is an active transaction at the moment" when trying to login after logout

### **What We've Implemented**
- ✅ Proper logout function with local cleanup
- ✅ Auth0 instance reset after logout  
- ✅ Session clearing before login attempts
- ✅ Force cleanup debug function
- ✅ All the solutions from your original guide

### **The Persistent Problem**
Even with all fixes implemented, we're still getting this error during login:
```
🔐 Clear session (expected): [Error: Failed to start this transaction, as there is an active transaction at the moment.]
🔐 Calling Auth0 webAuth.authorize...
ERROR: Failed to start this transaction, as there is an active transaction at the moment.
```

### **What We Need From Backend Team**
1. **Is there a different Auth0 SDK approach** we should be using for React Native?
2. **Are there iOS-specific Auth0 configuration settings** we're missing?
3. **Should we be using a different authentication flow** entirely?
4. **Is there a known workaround** for this persistent iOS Auth0 session issue?
5. **Do we need to update Auth0 SDK version** or use different dependencies?

### **Current Auth0 Configuration**
- **Domain**: `dev-a6z1zwjm1wj3xpjg.us.auth0.com`
- **Client ID**: `LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx`
- **Scheme**: `com.leemilstein.viewvault`
- **React Native Auth0 SDK**: `^3.2.1`
- **Platform**: iOS Simulator

### **Next Steps Needed**
Please provide guidance on:
1. Alternative Auth0 implementation approach
2. iOS-specific configuration requirements
3. Whether this is a known limitation with workarounds

---

## 🔧 **BACKEND TEAM RESPONSES TO iOS QUESTIONS**

### **Answer 1: Different Auth0 SDK Approach**
**YES** - You should use the **Auth0 React Native SDK v3.x** with a **different initialization pattern**. The issue is that you're trying to clear sessions on an instance that may have internal state conflicts.

**SOLUTION**: Use **singleton pattern** with **proper lifecycle management**:

```javascript
// Create a singleton Auth0 manager
class Auth0Manager {
  static instance = null;
  static auth0 = null;
  
  static getInstance() {
    if (!Auth0Manager.instance) {
      Auth0Manager.instance = new Auth0Manager();
    }
    return Auth0Manager.instance;
  }
  
  async initialize() {
    // Always destroy existing instance first
    if (Auth0Manager.auth0) {
      Auth0Manager.auth0 = null;
    }
    
    // Create fresh instance
    Auth0Manager.auth0 = new Auth0({
      domain: 'dev-a6z1zwjm1wj3xpjg.us.auth0.com',
      clientId: 'LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx',
      audience: 'https://app.viewvault.app/api',
      scheme: 'com.leemilstein.viewvault'
    });
  }
  
  async login() {
    await this.initialize(); // Always reinitialize before login
    
    try {
      const credentials = await Auth0Manager.auth0.webAuth.authorize({
        scope: 'openid profile email',
        audience: 'https://app.viewvault.app/api'
      });
      return credentials;
    } catch (error) {
      // If still getting transaction error, force app restart
      if (error.message.includes('active transaction')) {
        throw new Error('FORCE_APP_RESTART_NEEDED');
      }
      throw error;
    }
  }
  
  async logout() {
    try {
      if (Auth0Manager.auth0?.webAuth) {
        await Auth0Manager.auth0.webAuth.clearSession();
      }
    } catch (error) {
      console.log('Logout cleanup (expected):', error);
    }
    
    // Clear local storage
    await AsyncStorage.clear();
    
    // Destroy instance
    Auth0Manager.auth0 = null;
  }
}

// Usage
const auth0Manager = Auth0Manager.getInstance();
```

### **Answer 2: iOS-Specific Configuration Settings**
**YES** - You're missing **iOS-specific configuration**. Add these settings:

```javascript
// iOS-specific Auth0 configuration
const auth0Config = {
  domain: 'dev-a6z1zwjm1wj3xpjg.us.auth0.com',
  clientId: 'LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx',
  audience: 'https://app.viewvault.app/api',
  scheme: 'com.leemilstein.viewvault',
  
  // iOS-specific settings
  ios: {
    customScheme: 'com.leemilstein.viewvault',
    useLegacyCallbackURL: false, // IMPORTANT: Set to false
    usePKCE: true, // Enable PKCE for better security
  },
  
  // Additional settings
  useLegacyCallbackURL: false,
  usePKCE: true,
  useRefreshTokens: false, // Disable refresh tokens to avoid state issues
};
```

### **Answer 3: Different Authentication Flow**
**YES** - Try the **"fresh instance" approach** instead of trying to clear sessions:

```javascript
// Alternative approach: Always create fresh Auth0 instance
async function loginWithFreshInstance() {
  try {
    // 1. Create completely new Auth0 instance
    const freshAuth0 = new Auth0({
      domain: 'dev-a6z1zwjm1wj3xpjg.us.auth0.com',
      clientId: 'LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx',
      audience: 'https://app.viewvault.app/api',
      scheme: 'com.leemilstein.viewvault'
    });
    
    // 2. Use fresh instance for authentication
    const credentials = await freshAuth0.webAuth.authorize({
      scope: 'openid profile email',
      audience: 'https://app.viewvault.app/api'
    });
    
    // 3. Handle success
    await handleAuthSuccess(credentials);
    
    // 4. Don't store the instance - let it be garbage collected
    
  } catch (error) {
    console.error('Fresh instance login error:', error);
    throw error;
  }
}
```

### **Answer 4: Known Workaround**
**YES** - This is a **known issue** with React Native Auth0 SDK. Here's the **proven workaround**:

```javascript
// WORKAROUND: Force app restart on transaction error
async function loginWithWorkaround() {
  try {
    return await loginWithFreshInstance();
  } catch (error) {
    if (error.message.includes('active transaction')) {
      // Known workaround: Show user message and restart app
      Alert.alert(
        'Authentication Issue',
        'Please restart the app and try again.',
        [
          {
            text: 'Restart App',
            onPress: () => {
              // Force app restart (React Native)
              RNRestart.Restart();
            }
          }
        ]
      );
      return;
    }
    throw error;
  }
}
```

**Install restart package**:
```bash
npm install react-native-restart
```

### **Answer 5: SDK Version Update**
**YES** - Update to **latest version** and add **additional dependencies**:

```bash
# Update to latest version
npm install react-native-auth0@latest

# Add restart package for workaround
npm install react-native-restart

# For iOS, also install:
cd ios && pod install
```

**Recommended version**: `react-native-auth0@^3.2.1` (you're already on this, but ensure it's the latest patch)

---

## 🚀 **RECOMMENDED IMPLEMENTATION FOR iOS TEAM**

### **Step 1: Implement Singleton Pattern**
Use the `Auth0Manager` class above instead of global Auth0 instance.

### **Step 2: Add iOS-Specific Config**
Add the iOS-specific configuration settings.

### **Step 3: Implement Workaround**
Add the restart workaround for persistent transaction errors.

### **Step 4: Test Flow**
1. Login → Logout → Login (should work)
2. If still fails, app will restart automatically
3. After restart, login should work

### **Step 5: Fallback Plan**
If all else fails, implement **manual token refresh** instead of Auth0 SDK:

```javascript
// Fallback: Manual token exchange
async function manualLogin() {
  // Get Auth0 URL from backend
  const response = await fetch('https://app.viewvault.app/api/auth/auth0/mobile/login');
  const { auth_url } = await response.json();
  
  // Open in WebView and handle callback manually
  // (This bypasses Auth0 SDK entirely)
}
```

---

## 🔍 **ORIGINAL PROBLEM (Backend Team's Initial Analysis)**

The error `"Failed to start this transaction, as there is an active transaction at the moment"` is a classic Auth0 SDK issue. The Auth0 SDK thinks there's still an active authentication session, so it won't start a new one.

**Root Cause**: Auth0 session not properly cleaned up after logout, causing SDK state management issues.

## 🛠️ **Solution**

### **Fix 1: Proper Auth0 Session Cleanup**

The iOS team needs to properly clean up the Auth0 session. Here's the correct approach:

```javascript
// Proper logout function
async function logout() {
  try {
    // 1. Clear local storage first
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('auth0_credentials');
    
    // 2. Clear Auth0 session properly
    if (auth0 && auth0.webAuth) {
      try {
        await auth0.webAuth.clearSession();
      } catch (error) {
        console.log('Clear session error (expected):', error);
      }
    }
    
    // 3. Reset Auth0 instance completely
    auth0 = null;
    
    // 4. Reinitialize Auth0 for next login
    await initializeAuth0();
    
  } catch (error) {
    console.error('Logout error:', error);
  }
}
```

### **Fix 2: Proper Auth0 Initialization**

```javascript
// Proper Auth0 initialization
async function initializeAuth0() {
  try {
    // Destroy existing instance if it exists
    if (auth0) {
      auth0 = null;
    }
    
    // Create new instance
    auth0 = new Auth0({
      domain: 'dev-a6z1zwjm1wj3xpjg.us.auth0.com',
      clientId: 'LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx',
      audience: 'https://app.viewvault.app/api',
      scheme: 'com.leemilstein.viewvault'
    });
    
    console.log('✅ Auth0 instance created successfully');
    
  } catch (error) {
    console.error('❌ Auth0 initialization failed:', error);
  }
}
```

### **Fix 3: Safe Login Function**

```javascript
// Safe login function that handles existing sessions
async function loginWithGoogle() {
  try {
    // 1. Ensure Auth0 is properly initialized
    if (!auth0) {
      await initializeAuth0();
    }
    
    // 2. Clear any existing session first
    try {
      await auth0.webAuth.clearSession();
    } catch (error) {
      console.log('Clear session (expected):', error);
    }
    
    // 3. Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 4. Start new authentication
    const credentials = await auth0.webAuth.authorize({
      scope: 'openid profile email',
      audience: 'https://app.viewvault.app/api'
    });
    
    // 5. Handle successful authentication
    await handleAuthSuccess(credentials);
    
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}
```

### **Fix 4: App State Management**

```javascript
// Handle app state changes
useEffect(() => {
  const handleAppStateChange = (nextAppState) => {
    if (nextAppState === 'active') {
      // App became active - check for stale Auth0 sessions
      if (auth0 && auth0.webAuth) {
        auth0.webAuth.clearSession().catch(() => {
          // Ignore errors - this is just cleanup
        });
      }
    }
  };
  
  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription?.remove();
}, []);
```

### **Fix 5: Force Cleanup Function**

Add this debug function for testing:

```javascript
// Force cleanup function for testing
window.forceCleanup = async function() {
  try {
    console.log('🧹 Force cleaning up Auth0...');
    
    // Clear storage
    await AsyncStorage.clear();
    
    // Clear Auth0 session
    if (auth0 && auth0.webAuth) {
      await auth0.webAuth.clearSession();
    }
    
    // Reset instance
    auth0 = null;
    
    // Reinitialize
    await initializeAuth0();
    
    console.log('✅ Force cleanup complete');
    
  } catch (error) {
    console.error('❌ Force cleanup failed:', error);
  }
};
```

## 🚀 **Quick Fix for Testing**

For immediate testing:

1. **Add the force cleanup function** above
2. **Call `window.forceCleanup()`** in the console before trying to login
3. **Then try the login again**

## 📋 **Implementation Checklist**

- [ ] Implement proper logout function with session cleanup
- [ ] Add proper Auth0 initialization with instance management
- [ ] Update login function to clear sessions before starting new auth
- [ ] Add app state change handling
- [ ] Add force cleanup function for debugging
- [ ] Test logout and re-login flow

## 🔑 **Key Points**

1. **Auth0 SDK maintains internal state** - if not properly cleaned up, it prevents new authentication attempts
2. **Always clear sessions** before starting new authentication
3. **Reset Auth0 instance** after logout to ensure clean state
4. **Handle app state changes** to prevent stale sessions
5. **Add proper error handling** for session cleanup operations

## 🎯 **Expected Result**

After implementing these fixes:
- ✅ Logout should properly clear all Auth0 sessions
- ✅ Re-login should work without "active transaction" errors
- ✅ App state changes won't cause authentication issues
- ✅ Debug function available for troubleshooting
