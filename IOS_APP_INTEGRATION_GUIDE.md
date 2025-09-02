# 📱 iOS App Integration Guide

## 🎯 **Current Status & Goal**
- ✅ **Backend is RC-ready** with working admin console, user management, and all features
- ✅ **iOS app needs endpoint configuration update** to point to working backend
- ✅ **Goal: Get iOS app to same RC status as web client for v1 launch**

## 🌐 **Backend Details**
- **Public endpoint:** `https://app.viewvault.app` (NOT local NAS IP)
- **Current Docker image:** `lcmilstein/viewvault:ios-integration-dev`
- **Features working:** Admin console, user management, movie/series import, "New" badges, etc.
- **No backend changes needed** - just endpoint configuration

## 🔧 **What the iOS App Needs**
1. **API endpoint configuration** - Change from Cloudflare URL to `https://app.viewvault.app`
2. **Test all existing features** with the working backend
3. **Verify same functionality** as web client

## 📁 **Files to Look For in iOS App**
- **Config files** (constants, environment variables)
- **API service files** (where HTTP requests are made)
- **Base URL configurations**
- **Environment configuration files**

## ✅ **Testing Checklist**
- [ ] Login/authentication via `app.viewvault.app`
- [ ] Admin console access (if applicable)
- [ ] Movie/series browsing
- [ ] Import functionality
- [ ] User management features
- [ ] "New" badge display
- [ ] All existing features work as expected

## 🚀 **Development Approach**
- **Use the working backend** - no need to modify it
- **Focus on iOS app configuration** and testing
- **Get to RC status** alongside web client
- **Test from different networks** (not just local)

## 📋 **Next Steps**
1. **Open iOS app folder in Cursor**
2. **Locate API endpoint configuration**
3. **Update to point to `https://app.viewvault.app`**
4. **Test all features**
5. **Verify RC status**

## 🔍 **Common Places to Check**
- `src/config/` or `config/` directories
- `src/services/` or `services/` directories
- `src/constants/` or `constants/` directories
- `.env` files
- `package.json` scripts
- Main app configuration files

## 📝 **Notes**
- The backend is already working and accessible via the public domain
- The iOS app just needs to point to the right URL
- This should be a configuration change, not a code rewrite
- Test from different networks to ensure the public domain works correctly
