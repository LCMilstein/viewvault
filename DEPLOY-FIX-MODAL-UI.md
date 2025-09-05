# Deploy Fix Modal UI Branch

## Quick Deployment Steps

1. **In Portainer:**
   - Go to your ViewVault container
   - Stop the container
   - Go to "Edit" or "Recreate"
   - Change the image to: `lcmilstein/viewvault-backend-web:fix-modal-ui`
   - Or if using build from source, change the branch to `fix-modal-ui`
   - Start the container

2. **Verify the changes:**
   - Open browser console (F12)
   - Look for: `🚨 ViewVault JavaScript loaded! - FIX-MODAL-UI BRANCH v1.0`
   - This confirms you're running the new version

3. **Test the fixes:**
   - Movies in collections from watchlist should be clickable
   - Collections from watchlist should open in modals
   - Seasons from watchlist should open in modals
   - Episodes from watchlist should open in modals
   - Episodes in series details modal should be clickable
   - All details should use the unified modal UI

## What's Fixed

- ✅ Added clickable-area structure to movies in collections
- ✅ Made episodes in series details modal clickable
- ✅ Removed all references to old full-page overlay functions
- ✅ Unified all details views to use single modal system
- ✅ Fixed toggle functions to work with new modal system

## Branch Info

- **Branch:** `fix-modal-ui`
- **Based on:** `develop` branch with all modal fixes
- **Version ID:** FIX-MODAL-UI BRANCH v1.0
