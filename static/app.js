const API_BASE = '/api';

// Test if JavaScript is loading
console.log('🚨 ViewVault JavaScript loaded!');
console.log('🚨 API_BASE set to:', API_BASE);

// Offline functionality and PWA support
let isOnline = navigator.onLine;
let offlineData = null;
let pendingChanges = [];

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
                
                // Handle service worker updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available
                            showSuccess('New version available! Refreshing...');
                            setTimeout(() => window.location.reload(), 2000);
                        }
                    });
                });
                
                // Listen for messages from service worker
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data.type === 'SYNC_COMPLETE') {
                        console.log('Background sync completed');
                        if (event.data.success) {
                            // Reload watchlist to show updated data
                            loadWatchlist();
                        }
                    }
                });
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Update online status and handle offline/online events
function updateOnlineStatus() {
    const statusElement = document.getElementById('onlineStatus');
    if (statusElement) {
        if (isOnline) {
            statusElement.textContent = '🟢 Online';
            statusElement.className = 'online-status online';
        } else {
            statusElement.textContent = '🔴 Offline';
            statusElement.className = 'online-status offline';
        }
    }
}

// Listen for online/offline events
window.addEventListener('online', () => {
    isOnline = true;
    updateOnlineStatus();
    console.log('App is now online');
    // Sync any pending changes when coming back online
    syncPendingChanges();
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateOnlineStatus();
    console.log('App is now offline');
});

// Initialize online status
updateOnlineStatus();

// IndexedDB for offline storage
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ViewVaultDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores
            if (!db.objectStoreNames.contains('watchlist')) {
                db.createObjectStore('watchlist', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('pendingChanges')) {
                db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// Cache watchlist data for offline use
async function cacheWatchlistData(data) {
    try {
        const db = await openDB();
        const transaction = db.transaction(['watchlist'], 'readwrite');
        const store = transaction.objectStore('watchlist');
        
        // Store the entire watchlist data
        await store.put({
            id: 'current',
            data: data,
            timestamp: Date.now()
        });
        
        console.log('Watchlist data cached for offline use');
    } catch (error) {
        console.error('Error caching watchlist data:', error);
    }
}

// Load cached watchlist data
async function loadCachedWatchlist() {
    try {
        const db = await openDB();
        const transaction = db.transaction(['watchlist'], 'readonly');
        const store = transaction.objectStore('watchlist');
        const result = await store.get('current');
        
        if (result && result.data) {
            console.log('Loaded cached watchlist data');
            return result.data;
        }
    } catch (error) {
        console.error('Error loading cached watchlist:', error);
    }
    return null;
}

// Queue changes for offline sync
async function queueChange(change) {
    try {
        const db = await openDB();
        const transaction = db.transaction(['pendingChanges'], 'readwrite');
        const store = transaction.objectStore('pendingChanges');
        
        // Add timestamp and unique ID
        const changeWithMetadata = {
            ...change,
            timestamp: Date.now(),
            id: Date.now() + Math.random() // Simple unique ID
        };
        
        await store.add(changeWithMetadata);
        console.log('Change queued for offline sync:', changeWithMetadata);
        
        // If online, try to sync immediately
        if (isOnline) {
            syncPendingChanges();
        }
        
        return true;
    } catch (error) {
        console.error('Failed to queue change:', error);
        return false;
    }
}

// Sync pending changes when online
async function syncPendingChanges() {
    if (!isOnline) {
        console.log('Cannot sync - offline');
        return;
    }
    
    try {
        const db = await openDB();
        const transaction = db.transaction(['pendingChanges'], 'readonly');
        const store = transaction.objectStore('pendingChanges');
        const changes = await store.getAll();
        
        if (changes.length === 0) {
            console.log('No pending changes to sync');
            return;
        }
        
        console.log(`Syncing ${changes.length} pending changes...`);
        
        // Sort by timestamp to process oldest first
        changes.sort((a, b) => a.timestamp - b.timestamp);
        
        for (const change of changes) {
            try {
                const response = await fetch(change.url, {
                    method: change.method,
                    headers: change.headers,
                    body: change.body
                });
                
                if (response.ok) {
                    // Remove from pending changes
                    const deleteTransaction = db.transaction(['pendingChanges'], 'readwrite');
                    const deleteStore = deleteTransaction.objectStore('pendingChanges');
                    await deleteStore.delete(change.id);
                    console.log('Successfully synced change:', change.id);
                } else {
                    console.log('Failed to sync change:', change.id, response.status);
                }
            } catch (error) {
                console.log('Error syncing change:', change.id, error);
            }
        }
        
        // Reload watchlist to show updated data
        loadWatchlist();
        
    } catch (error) {
        console.error('Error syncing pending changes:', error);
    }
}

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('access_token');
    console.log('Checking authentication, token exists:', !!token);
    
    if (!token) {
        console.log('No token found, redirecting to login');
        window.location.href = '/login';
        return false;
    }
    
    // Additional validation - check if token is valid format
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('Token payload:', payload);
        
        // Check if token is expired
        const currentTime = Date.now() / 1000; // Convert to seconds
        if (payload.exp && payload.exp < currentTime) {
            console.log('Token expired, clearing and redirecting to login');
            localStorage.removeItem('access_token');
            window.location.href = '/login';
            return false;
        }
        
        // Test token with backend
        try {
            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                console.log('Token validated with backend successfully');
                // Check admin status after successful authentication
                await checkAdminStatus();
                return true;
            } else {
                console.log('Token rejected by backend, clearing and redirecting to login');
                localStorage.removeItem('access_token');
                window.location.href = '/login';
                return false;
            }
        } catch (error) {
            console.error('Error validating token with backend:', error);
            // If we can't reach the backend, assume token is valid for now
            console.log('Backend unreachable, assuming token is valid');
            return true;
        }
        
    } catch (error) {
        console.error('Error parsing token:', error);
        console.log('Invalid token format, clearing and redirecting to login');
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return false;
    }
}

// Check admin status and show/hide admin console link
async function checkAdminStatus() {
    console.log('🚨 checkAdminStatus function called!');
    try {
        console.log('🔍 Checking admin status...');
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: getAuthHeaders()
        });
        
        console.log('🔍 Admin status response:', response.status);
        
        if (response.ok) {
            const user = await response.json();
            console.log('🔍 User data:', user);
            console.log('🔍 Is admin?', user.is_admin);
            
            const adminConsoleLink = document.getElementById('adminConsoleLink');
            console.log('🔍 Admin console link element:', adminConsoleLink);
            console.log('🔍 All elements with adminConsoleLink ID:', document.querySelectorAll('#adminConsoleLink'));
            console.log('🔍 Admin console link HTML:', adminConsoleLink ? adminConsoleLink.outerHTML : 'NOT FOUND');
            
            if (adminConsoleLink) {
                if (user.is_admin) {
                    console.log('✅ User is admin, making link visible');
                    adminConsoleLink.classList.add("admin-visible");
                    // Add click handler for admin console
                    adminConsoleLink.onclick = async () => {
                        console.log('🔍 Admin console clicked!');
                        try {
                            const token = localStorage.getItem("access_token");
                            if (!token) {
                                console.error("No access token found");
                                return;
                            }
                            
                            console.log('🔍 Navigating to admin page...');
                            // Navigate directly to admin page
                            window.location.href = "/static/admin.html";
                        } catch (error) {
                            console.error("Error accessing admin console:", error);
                        }
                    };
                    console.log('✅ Admin console click handler added');
                } else {
                    console.log('❌ User is not admin, hiding link');
                    adminConsoleLink.classList.remove("admin-visible");
                }
            } else {
                console.log('❌ Admin console link element not found');
            }
        } else {
            console.log('❌ Admin status check failed:', response.status);
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }
}

// Navigate to admin console
function openAdminConsole() {
    const token = localStorage.getItem('access_token'); if (token) { fetch('/admin', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => { if (r.ok) window.location.href = '/admin'; }); }
}

// Add auth header to all requests
function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Cleanup function to remove event listeners and stop ongoing operations
function cleanupApp() {
    // Clear any ongoing intervals or timeouts
    if (window.tokenExpirationInterval) {
        clearInterval(window.tokenExpirationInterval);
    }
    
    // Clear any pending fetch requests
    if (window.pendingRequests) {
        window.pendingRequests.forEach(controller => controller.abort());
        window.pendingRequests = [];
    }
    
    // Stop any ongoing async operations
    if (window.currentWatchlistData) {
        window.currentWatchlistData = null;
    }
}

// Logout function
async function logout() {
    try {
        // Clean up event listeners and ongoing operations
        cleanupApp();
        
        // Clear all cached data and pending changes
        if ('indexedDB' in window) {
            try {
                const db = await openDB();
                const transaction = db.transaction(['watchlist', 'pendingChanges', 'settings'], 'readwrite');
                
                // Clear watchlist cache
                const watchlistStore = transaction.objectStore('watchlist');
                await watchlistStore.clear();
                
                // Clear pending changes
                const pendingStore = transaction.objectStore('pendingChanges');
                await pendingStore.clear();
                
                // Clear settings
                const settingsStore = transaction.objectStore('settings');
                await settingsStore.clear();
                
                console.log('Cleared all cached data');
            } catch (error) {
                console.error('Error clearing cached data:', error);
            }
        }
        
        // Clear service worker cache
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
                console.log('Cleared service worker cache');
            } catch (error) {
                console.error('Error clearing cache:', error);
            }
        }
        
        // Unregister service worker
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration) {
                    await registration.unregister();
                    console.log('Unregistered service worker');
                }
            } catch (error) {
                console.error('Error unregistering service worker:', error);
            }
        }
        
        // Clear localStorage
        localStorage.removeItem('access_token');
        
        // Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Redirect to login page with a timeout to prevent hanging
        setTimeout(() => {
            window.location.href = '/login';
        }, 50);
        
    } catch (error) {
        console.error('Error during logout:', error);
        // Fallback: just clear token and redirect
        localStorage.removeItem('access_token');
        window.location.href = '/login';
    }
}

// Simple Account modal for changing password on web
function openAccountModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-label="Account">
        <div class="modal-header"><h3>Account</h3><p class="modal-subtitle">Update your password</p></div>
        <div class="modal-body">
          <div class="form-group"><label>Current Password</label><input type="password" id="curPw" placeholder="Current password"/></div>
          <div class="form-group"><label>New Password</label><input type="password" id="newPw" placeholder="New password (min 8)"/></div>
          <div class="form-group"><label>Confirm New Password</label><input type="password" id="newPw2" placeholder="Confirm new password"/></div>
          <div id="pwError" style="color:#ff6b6b;margin-top:8px;display:none"></div>
        </div>
        <div class="modal-buttons">
          <button class="btn btn-secondary" id="accCancel">Cancel</button>
          <button class="btn btn-primary" id="accSave">Change Password</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => document.body.removeChild(overlay);
    overlay.querySelector('#accCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
    overlay.querySelector('#accSave').addEventListener('click', async ()=>{
        const cur = overlay.querySelector('#curPw').value;
        const np = overlay.querySelector('#newPw').value;
        const np2 = overlay.querySelector('#newPw2').value;
        const err = overlay.querySelector('#pwError');
        err.style.display='none';
        if(!cur || !np || !np2){ err.textContent='Please fill out all fields.'; err.style.display='block'; return; }
        if(np!==np2){ err.textContent='New passwords do not match.'; err.style.display='block'; return; }
        if(np.length<8){ err.textContent='New password must be at least 8 characters.'; err.style.display='block'; return; }
        try{
            const res = await fetch('/api/auth/change-password', { method:'POST', headers:{ 'Content-Type':'application/json', ...getAuthHeaders() }, body: JSON.stringify({ current_password: cur, new_password: np }) });
            if(!res.ok){ const t=await res.text(); throw new Error(t||'Failed'); }
            showToast('Password updated. Please sign in again.');
            await logout();
            close();
        }catch(e){ err.textContent = (e?.message||'Failed to change password'); err.style.display='block'; }
    });
}

// Toast notification function
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto-hide
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Check token expiration and show warning if needed
function checkTokenExpiration() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    
    try {
        // Decode JWT token to get expiration
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = payload.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        const timeUntilExpiration = expirationTime - currentTime;
        
        // Show warning if token expires in less than 30 days
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        if (timeUntilExpiration < thirtyDaysInMs && timeUntilExpiration > 0) {
            const daysLeft = Math.ceil(timeUntilExpiration / (24 * 60 * 60 * 1000));
            showWarning(`Your login session will expire in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Please log in again to continue using the app.`);
        }
        
        // If token is expired, redirect to login
        if (timeUntilExpiration <= 0) {
            showError('Your login session has expired. Please log in again.');
            setTimeout(async () => {
                await logout();
            }, 3000);
        }
    } catch (error) {
        console.error('Error checking token expiration:', error);
    }
}

let currentSearchResults = [];

window.watchlistState = {
    unwatchedOnly: false,
    sortBy: 'alphabetical',
    expandedSeries: {}, // seriesId: true/false
    expandedCollections: {}, // collectionId: true/false
    expandedSeasons: {}, // seriesId-seasonNumber: true/false
    watchTimeFilter: 'all', // all, short, standard, long, epic
};

window.watchlistFilters = { 
    movies: true, 
    series: true, 
    unwatched: true,
    runtime_under_30: true,
    runtime_30_60: true,
    runtime_60_90: true,
    runtime_over_90: true
};

// Individual item notification system
let newItems = {
    movies: [],
    series: [],
    episodes: []
};

// Check for new releases and update individual item badges
async function checkForNewReleases() {
    try {
        const response = await fetch(`${API_BASE}/notifications/details`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            newItems = {
                movies: data.new_movies || [],
                series: data.new_series || [],
                newly_imported_movies: data.newly_imported_movies || [],
                newly_imported_series: data.newly_imported_series || []
            };
            
            // Reload watchlist to show new items with badges
            loadWatchlist();
        }
    } catch (error) {
        console.error('Failed to check for new releases:', error);
    }
}

// Mark specific item as seen (clear badge)
async function markItemAsSeen(itemType, itemId) {
    try {
        const response = await fetch(`${API_BASE}/watchlist/${itemType}/${itemId}/interacted`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Remove from new items list
            if (itemType === 'movie') {
                newItems.movies = newItems.movies.filter(m => m.id !== itemId);
            } else if (itemType === 'series') {
                newItems.series = newItems.series.filter(s => s.id !== itemId);
            }
            
            // Reload watchlist to update ordering
            loadWatchlist();
        }
    } catch (error) {
        console.error('Failed to mark item as seen:', error);
    }
}

// Check if item is new
function isItemNew(itemType, itemId) {
    if (itemType === 'movie') {
        return newItems.movies.some(m => m.id === itemId);
    } else if (itemType === 'series') {
        return newItems.series.some(s => s.id === itemId);
    }
    return false;
}

// Clear newly imported status when details are viewed
function clearNewlyImportedStatus(itemType, itemId) {
    console.log(`🔍 Clearing newly imported status for ${itemType} ${itemId}`);
    
    // For seasons and episodes, we don't need to clear anything since they don't have imported_at status
    if (itemType === 'season' || itemType === 'episode') {
        console.log(`🔍 ${itemType} clicked - no need to clear imported status`);
        return;
    }
    
    // Remove from global newItems state
    if (itemType === 'movie') {
        if (newItems.newly_imported_movies) {
            newItems.newly_imported_movies = newItems.newly_imported_movies.filter(m => m.id !== itemId);
        }
    } else if (itemType === 'series') {
        if (newItems.newly_imported_series) {
            newItems.newly_imported_series = newItems.newly_imported_series.filter(s => s.id !== itemId);
        }
    }
    
    // Also clear the imported_at field by making an API call
    // This ensures the badge won't show again even after page refresh
    fetch(`/api/${itemType}s/${itemId}/clear-newly-imported`, {
        method: 'POST',
        headers: getAuthHeaders()
    }).catch(error => {
        console.log('Could not clear newly imported status on server:', error);
    });
}

// Check if item is newly imported
function isItemNewlyImported(itemType, itemId) {
    console.log(`🔍 Checking if ${itemType} ${itemId} is newly imported...`);
    console.log(`🔍 Current newItems state:`, newItems);
    
    // First check the global newItems state (for Jellyfin imports)
    if (itemType === 'movie') {
        if (newItems.newly_imported_movies && newItems.newly_imported_movies.some(m => m.id === itemId)) {
            console.log(`✅ Found in global newItems.newly_imported_movies`);
            return true;
        }
    } else if (itemType === 'series') {
        if (newItems.newly_imported_series && newItems.newly_imported_series.some(s => s.id === itemId)) {
            console.log(`✅ Found in global newItems.newly_imported_series`);
            return true;
        }
    }
    
    // If not in global state, check the individual item's imported_at field
    // This handles manual imports and other cases where imported_at is set
    const item = findItemById(itemType, itemId);
    console.log(`🔍 Found item:`, item);
    
    if (item && item.imported_at) {
        console.log(`🔍 Item has imported_at: ${item.imported_at}`);
        const importedTime = new Date(item.imported_at);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const isNewlyImported = importedTime > oneDayAgo;
        console.log(`🔍 Imported time: ${importedTime}, One day ago: ${oneDayAgo}, Is newly imported: ${isNewlyImported}`);
        return isNewlyImported;
    } else {
        console.log(`❌ Item not found or no imported_at field`);
    }
    
    return false;
}

// Helper function to find an item by ID in the current watchlist data
function findItemById(itemType, itemId) {
    const watchlistData = window.currentWatchlistData || window.lastWatchlistData;
    console.log(`🔍 Looking for ${itemType} ${itemId} in watchlist data:`, watchlistData);
    
    if (!watchlistData) {
        console.log(`❌ No watchlist data available`);
        return null;
    }
    
    if (itemType === 'movie') {
        // Check standalone movies
        if (watchlistData.movies) {
            console.log(`🔍 Checking ${watchlistData.movies.length} standalone movies`);
            const movie = watchlistData.movies.find(m => m.id === itemId);
            if (movie) {
                console.log(`✅ Found movie in standalone movies:`, movie);
                return movie;
            }
        }
        
        // Check movies in collections
        if (watchlistData.collections && Array.isArray(watchlistData.collections)) {
            console.log(`🔍 Checking ${watchlistData.collections.length} collections`);
            for (const collection of watchlistData.collections) {
                if (collection && collection.items && Array.isArray(collection.items)) {
                    console.log(`🔍 Checking collection ${collection.title || collection.name} with ${collection.items.length} movies`);
                    const movie = collection.items.find(m => m && m.id === itemId);
                    if (movie) {
                        console.log(`✅ Found movie in collection ${collection.title || collection.name}:`, movie);
                        return movie;
                    }
                }
            }
        }
    } else if (itemType === 'series') {
        if (watchlistData.series) {
            console.log(`🔍 Checking ${watchlistData.series.length} series`);
            const series = watchlistData.series.find(s => s.id === itemId);
            if (series) {
                console.log(`✅ Found series:`, series);
                return series;
            }
        }
    }
    
    console.log(`❌ Item ${itemType} ${itemId} not found in watchlist data`);
    return null;
}

function showTab(tabName) {
    console.log('showTab called with:', tabName);
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
        console.log('Activated tab content:', tabName);
    } else {
        console.error('Tab content not found:', tabName);
    }
    
    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Load content based on tab
    if (tabName === 'search') {
        console.log('Loading watchlist for search tab...');
        loadWatchlist();
    } else if (tabName === 'stats') {
        console.log('Loading stats...');
        loadStats();
    }
}

async function searchMovies() {
    console.log('searchMovies called');
    document.getElementById('searchResultsMovies').innerHTML = '';
    document.getElementById('searchResultsSeries').innerHTML = '';
    const query = document.getElementById('searchMoviesInput').value.trim();
    if (!query) return;
    
    console.log('Searching for:', query);
    console.log('API URL:', `${API_BASE}/search/movies/?query=${encodeURIComponent(query)}`);
    
    try {
        const response = await fetch(`${API_BASE}/search/movies/?query=${encodeURIComponent(query)}`, {
            headers: getAuthHeaders()
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        let results;
        try {
            results = await response.json();
            console.log('Search results:', results);
        } catch (e) {
            console.error('JSON parse error:', e);
            showError('Movie search failed: Invalid server response.');
            return;
        }
        displayMovieSearchResults(results);
        document.getElementById('searchMoviesInput').value = '';
    } catch (e) {
        console.error('Fetch error:', e);
        showError('Movie search failed: ' + (e.message || e));
    }
}

async function searchSeries() {
    console.log('searchSeries called');
    document.getElementById('searchResultsMovies').innerHTML = '';
    document.getElementById('searchResultsSeries').innerHTML = '';
    const query = document.getElementById('searchSeriesInput').value.trim();
    if (!query) return;
    try {
        const response = await fetch(`${API_BASE}/search/series/?query=${encodeURIComponent(query)}`, {
            headers: getAuthHeaders()
        });
        let results;
        try {
            results = await response.json();
        } catch (e) {
            showError('Series search failed: Invalid server response.');
            return;
        }
        displaySeriesSearchResults(results);
        document.getElementById('searchSeriesInput').value = '';
    } catch (e) {
        showError('Series search failed: ' + (e.message || e));
    }
}

function displayMovieSearchResults(results) {
    const container = document.getElementById('searchResultsMovies');
    if (!results || !results.length) {
        container.innerHTML = '<div class="no-results">No results found.</div>';
        return;
    }
    let html = '';
    for (const m of results) {
        const title = m.title || 'Untitled';
        const imdb_id = m.imdb_id || '';
        const release_date = m.release_date || '';
        let poster = m.poster_url || '/static/no-image.png';
        if (poster && poster.startsWith('/')) {
            poster = poster;
        } else if (poster && !poster.startsWith('http')) {
            poster = '/static/no-image.png';
        }
        html += `<div class="search-result-card" onclick="importItemWithSequels('${imdb_id}')" title="Import this movie and all sequels in the franchise">
            <img src="${poster}" alt="Poster" class="search-result-poster" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="search-result-info">
                <div class="search-result-title">${title}</div>
                <div class="search-result-meta">IMDB: ${imdb_id}</div>
                <button class="import-btn import-movie-btn" onclick="event.stopPropagation(); importItemWithSequels('${imdb_id}')">Import Movie</button>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function displayUnifiedSearchResults(results) {
    const moviesContainer = document.getElementById('searchResultsMovies');
    const seriesContainer = document.getElementById('searchResultsSeries');
    
    if (!results || !results.length) {
        moviesContainer.innerHTML = '<div class="no-results">No results found.</div>';
        seriesContainer.innerHTML = '';
        return;
    }
    
    let html = '';
    for (const item of results) {
        const title = item.title || 'Untitled';
        const imdb_id = item.imdb_id || '';
        let poster = item.poster_url || '/static/no-image.png';
        if (poster && poster.startsWith('/')) {
            poster = poster;
        } else if (poster && !poster.startsWith('http')) {
            poster = '/static/no-image.png';
        }
        
        const isSeries = item.type === 'series';
        const onclick = isSeries ? `importFullSeries('${imdb_id}')` : `importItemWithSequels('${imdb_id}')`;
        const title_text = isSeries ? 'Import full series' : 'Import this movie and all sequels in the franchise';
        const buttonText = isSeries ? 'Import Series' : 'Import Movie';
        const buttonClass = isSeries ? 'import-series-btn' : 'import-movie-btn';
        const buttonOnclick = isSeries ? `importFullSeries('${imdb_id}')` : `importItemWithSequels('${imdb_id}')`;
        
        html += `<div class="search-result-card" onclick="${onclick}" title="${title_text}">
            <img src="${poster}" alt="Poster" class="search-result-poster" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="search-result-info">
                <div class="search-result-title">${title}</div>
                <div class="search-result-meta">IMDB: ${imdb_id}</div>
                <button class="import-btn ${buttonClass}" onclick="event.stopPropagation(); ${buttonOnclick}">${buttonText}</button>
            </div>
        </div>`;
    }
    
    // Display all results in the movies container (since it's unified now)
    moviesContainer.innerHTML = html;
    seriesContainer.innerHTML = '';
}

async function importItemWithSequels(imdbId) {
    try {
        const response = await fetch(`${API_BASE}/import/movie/${imdbId}/sequels`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        if (response.ok) {
            showSuccess('Movie and sequels imported successfully!');
            // Clear search results and show watchlist
            document.getElementById('searchResultsMovies').innerHTML = '';
            document.getElementById('searchResultsSeries').innerHTML = '';
            // Clear smart omnibox search results
            clearSmartOmniboxSearch();
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

async function importFullSeries(imdbId) {
    try {
        const response = await fetch(`${API_BASE}/import/series/${imdbId}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            console.log('📺 Import response data:', data);
            showSuccess('Series imported successfully!');
            
            // Clear search results
            document.getElementById('searchResultsMovies').innerHTML = '';
            document.getElementById('searchResultsSeries').innerHTML = '';
            // Clear smart omnibox search results
            clearSmartOmniboxSearch();
            
            // Only show list selection dialog if multiple lists are currently visible
            const visibleLists = userLists.filter(list => selectedListIds.includes(list.id));
            if (visibleLists.length > 1) {
                const selectedLists = await showImportListSelectionDialog(data.title || 'Series', 'series', data.id || data.series_id);
                if (selectedLists.length > 0) {
                    await addSeriesToSelectedLists(data.id || data.series_id, data.title || 'Series', selectedLists);
                }
            } else {
                // If only one list is showing, add directly to that list
                const targetList = visibleLists.length === 1 ? visibleLists[0].id : 'personal';
                await addSeriesToSelectedLists(data.id || data.series_id, data.title || 'Series', [targetList]);
            }
            
            // Reload the appropriate watchlist (personal or custom lists)
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

async function importByUrl() {
    const url = document.getElementById('importUrlInput').value.trim();
    if (!url) return;
    
    try {
        const response = await fetch(`${API_BASE}/import/url`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url })
        });
        if (response.ok) {
            showSuccess('Item imported successfully!');
            document.getElementById('importUrlInput').value = '';
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

async function loadWatchlist() {
    if (!checkAuth()) return;
    
    const container = document.getElementById('watchlistContent');
    container.innerHTML = '<div class="loading">Loading your watchlist...</div>';
    
    try {
        console.log('Fetching watchlist data...');
        const authHeaders = getAuthHeaders();
        console.log('Auth headers:', authHeaders);
        console.log('Token from localStorage:', localStorage.getItem('access_token'));
        
        const response = await fetch(`${API_BASE}/watchlist`, {
            headers: authHeaders
        });
        console.log('Watchlist response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Watchlist data received:', {
                movies: data.movies?.length || 0,
                series: data.series?.length || 0,
                collections: data.collections?.length || 0
            });
            
            window.lastWatchlistData = data; // <-- Store for collection delete
            currentWatchlistData = data; // Store for search filtering
            
            // Cache the data for offline use
            await cacheWatchlistData(data);
            
            console.log('Rendering watchlist...');
            renderWatchlist(data);
            console.log('Watchlist rendering complete');
            
            // Update list counts after watchlist loads
            setTimeout(() => {
                updateListCounts();
            }, 100);
        } else {
            console.error('Watchlist request failed with status:', response.status);
            
            // Try to get the error response body
            try {
                const errorData = await response.text();
                console.error('Error response body:', errorData);
            } catch (e) {
                console.error('Could not read error response:', e);
            }
            
            // Try to load from cache if online request fails
            const cachedData = await loadCachedWatchlist();
            if (cachedData) {
                currentWatchlistData = cachedData;
                renderWatchlist(cachedData);
                showWarning('Showing cached data - some features may be limited');
            } else {
                showError('Failed to load watchlist');
            }
        }
    } catch (e) {
        // Network error - try to load from cache
        console.error('Network error, trying cached data:', e);
        const cachedData = await loadCachedWatchlist();
        if (cachedData) {
            currentWatchlistData = cachedData;
            renderWatchlist(cachedData);
            showWarning('Showing cached data - you are offline');
        } else {
            showError('Failed to load watchlist: ' + (e.message || e));
        }
    }
}

// --- Custom Sort Dropdown Logic ---

function setSortOption(option) {
    console.log('Setting sort option:', option);
    
    try {
        // Validate the sort option
        const validOptions = ['added', 'added_newest', 'alphabetical', 'alphabetical_reverse', 'release_date', 'release_date_newest'];
        if (!validOptions.includes(option)) {
            console.error('Invalid sort option:', option);
            option = 'alphabetical'; // Default to alphabetical
        }
        
        watchlistState.sortBy = option;
        console.log('Sort option set to:', watchlistState.sortBy);
        
        // Save the state immediately
        updateFilterState();
        
        // Reload the watchlist to apply the new sort
        loadWatchlist();
        
        // Update the sort row visual state if it's open
        const sortRow = document.getElementById('sortOptionsRow');
        if (sortRow) {
            // Recreate the sort row to show updated state
            setTimeout(() => {
                showSortOptions();
            }, 100);
        }
        
        // Update the sort button text
        updateSortButtonText();
    } catch (error) {
        console.error('Error setting sort option:', error);
        // Try to recover by setting a safe default
        try {
            watchlistState.sortBy = 'alphabetical';
            updateFilterState();
            loadWatchlist();
        } catch (e) {
            console.error('Failed to recover from sort error:', e);
            // Last resort - reload the page
            location.reload();
        }
    }
}

// --- Unified Watchlist Rendering ---
function renderWatchlist(data) {
    const container = document.getElementById('watchlistContent');
    if (!data || (!data.movies && !data.series && !data.collections)) {
        container.innerHTML = '<div class="no-results">Your watchlist is empty. Start by searching for movies or TV shows!</div>';
        return;
    }
    
    // Handle search results (filtered data has only collections)
    if (data.collections && !data.movies && !data.series) {
        let html = '<div class="watchlist-list">';
        for (const collection of data.collections) {
            html += renderUnifiedCollection(collection);
        }
        html += '</div>';
        container.innerHTML = html;
        

        
        setTimeout(() => {
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    const type = btn.getAttribute('data-type');
                    const id = btn.getAttribute('data-id');
                    removeFromWatchlist(type, id);
                };
            });
            
                }, 0);
    }
    
    let items = [];
    // Flatten all items into a single list with type info
    if (data.collections) {
        for (const collection of data.collections) {
            if (collection && typeof collection === 'object') {
                items.push({ ...collection, _itemType: 'collection' });
            }
        }
    }
    if (data.series) {
        for (const series of data.series) {
            if (series && typeof series === 'object') {
                items.push({ ...series, _itemType: 'series' });
            }
        }
    }
    if (data.movies) {
        for (const movie of data.movies) {
            if (movie && typeof movie === 'object') {
                items.push({ ...movie, _itemType: 'movie' });
            }
        }
    }
    // Filter by type
    items = items.filter(item => {
        if (!item || typeof item !== 'object') return false;
        
        if (item._itemType === 'collection' && !watchlistFilters.movies) return false;
        if (item._itemType === 'series' && !watchlistFilters.series) return false;
        if (item._itemType === 'movie' && !watchlistFilters.movies) return false;
        return true;
    });
    
    // Filter by unwatched
    if (watchlistFilters.unwatched) {
        items = items.filter(item => {
            if (!item || typeof item !== 'object') return false;
            
            if (item._itemType === 'collection') {
                return item.items && Array.isArray(item.items) && item.items.some(m => m && !m.watched);
            } else if (item._itemType === 'series') {
                return !item.watched || (item.episodes && Array.isArray(item.episodes) && item.episodes.some(ep => ep && !ep.watched));
            } else if (item._itemType === 'movie') {
                return !item.watched;
            }
            return true;
        });
    }
    
    // Apply runtime filters
    if (watchlistFilters.runtime_under_30 || watchlistFilters.runtime_30_60 || watchlistFilters.runtime_60_90 || watchlistFilters.runtime_over_90) {
        items = items.filter(item => {
            if (!item || typeof item !== 'object') return false;
            
            let runtime = 0;
            if (item._itemType === 'collection') {
                // For collections, use the first movie's runtime or average
                if (item.items && Array.isArray(item.items) && item.items.length > 0) {
                    const runtimes = item.items.map(m => m.runtime || 0).filter(r => r > 0);
                    runtime = runtimes.length > 0 ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : 0;
                }
            } else if (item._itemType === 'series') {
                // For series, use the first episode's runtime or average
                if (item.episodes && Array.isArray(item.episodes) && item.episodes.length > 0) {
                    const runtimes = item.episodes.map(ep => ep.runtime || 0).filter(r => r > 0);
                    runtime = runtimes.length > 0 ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : 0;
                }
            } else if (item._itemType === 'movie') {
                runtime = item.runtime || 0;
            }
            
            // Check if runtime matches at least one active filter
            if (runtime > 0) {
                const matchesUnder30 = runtime < 30 && watchlistFilters.runtime_under_30;
                const matches30to60 = runtime >= 30 && runtime <= 60 && watchlistFilters.runtime_30_60;
                const matches60to90 = runtime > 60 && runtime <= 90 && watchlistFilters.runtime_60_90;
                const matchesOver90 = runtime > 90 && watchlistFilters.runtime_over_90;
                
                // Only show item if it matches at least one active filter
                if (!(matchesUnder30 || matches30to60 || matches60to90 || matchesOver90)) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    // Update filter state after successful filtering
    updateFilterState();
    
    console.log('Before sorting - sortBy:', watchlistState.sortBy, 'items count:', items.length);
    
    // Sorting
    items = items.slice();
    
    // Safety check - ensure we have a valid sort option
    if (!watchlistState.sortBy || !items.length) {
        console.log('No sorting needed - sortBy:', watchlistState.sortBy, 'items count:', items.length);
        if (!watchlistState.sortBy) {
            debugSortState();
        }
    } else {
        console.log('Sorting by:', watchlistState.sortBy);
        
        switch (watchlistState.sortBy) {
            case 'alphabetical':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aTitle = (a.title || '').trim();
                    const bTitle = (b.title || '').trim();
                    if (!aTitle && !bTitle) return 0;
                    if (!aTitle) return 1; // Empty titles go last
                    if (!bTitle) return -1;
                    return aTitle.localeCompare(bTitle);
                });
                break;
            case 'alphabetical_reverse':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aTitle = (a.title || '').trim();
                    const bTitle = (b.title || '').trim();
                    if (!aTitle && !bTitle) return 0;
                    if (!aTitle) return 1; // Empty titles go last
                    if (!bTitle) return -1;
                    return bTitle.localeCompare(aTitle);
                });
                break;
            case 'release_date':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aDateStr = getReleaseDate(a);
                    const bDateStr = getReleaseDate(b);
                    
                    // Convert to Date objects for proper comparison
                    const aDate = new Date(aDateStr);
                    const bDate = new Date(bDateStr);
                    
                    if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
                        return 0;
                    }
                    
                    return aDate.getTime() - bDate.getTime();
                });
                break;
            case 'release_date_newest':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aDateStr = getReleaseDate(a);
                    const bDateStr = getReleaseDate(b);
                    
                    // Convert to Date objects for proper comparison
                    const aDate = new Date(aDateStr);
                    const bDate = new Date(bDateStr);
                    
                    if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
                        return 0;
                    }
                    
                    return bDate.getTime() - aDate.getTime();
                });
                break;
            case 'added':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aAdded = a.added_at || a.id || 0;
                    const bAdded = b.added_at || b.id || 0;
                    
                    // If added_at is a string (ISO date), convert to date for comparison
                    if (typeof aAdded === 'string' && typeof bAdded === 'string') {
                        const aDate = new Date(aAdded);
                        const bDate = new Date(bAdded);
                        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
                            return 0;
                        }
                        return aDate.getTime() - bDate.getTime();
                    }
                    
                    // Fallback to numeric comparison
                    return aAdded - bAdded;
                });
                break;
            case 'added_newest':
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    
                    // For movies and series, use added_at; for collections, use id
                    const aAdded = (a._itemType === 'movie' || a._itemType === 'series') ? a.added_at : a.id;
                    const bAdded = (b._itemType === 'movie' || b._itemType === 'series') ? b.added_at : b.id;
                    
                    // If both have added_at (movies/series), use date comparison
                    if (a.added_at && b.added_at) {
                        const aDate = new Date(a.added_at);
                        const bDate = new Date(b.added_at);
                        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
                            return 0;
                        }
                        return bDate.getTime() - aDate.getTime();
                    }
                    
                    // If one has added_at and the other doesn't, prioritize the one with added_at
                    if (a.added_at && !b.added_at) return -1;
                    if (!a.added_at && b.added_at) return 1;
                    
                    // Fallback to numeric comparison for collections
                    return bAdded - aAdded;
                });
                break;
            default:
                console.log('Unknown sort option:', watchlistState.sortBy);
                // Default to alphabetical
                items.sort((a, b) => {
                    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
                    const aTitle = (a.title || '').trim();
                    const bTitle = (b.title || '').trim();
                    if (!aTitle && !bTitle) return 0;
                    if (!aTitle) return 1;
                    if (!bTitle) return -1;
                    return aTitle.localeCompare(bTitle);
                });
        }
    }
    
    console.log('After sorting - first few items:', items.slice(0, 3).map(item => ({
        title: item.title,
        type: item._itemType,
        releaseDate: getReleaseDate(item),
        addedAt: item.added_at || item.id
    })));
    
    // Put new items at the top regardless of sort order
    items.sort((a, b) => {
        const aIsNew = a.is_new || false;
        const bIsNew = b.is_new || false;
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        return 0; // Keep relative order within new/non-new groups
    });
    // Render
    let html = '<div class="watchlist-list">';
    for (const item of items) {
        if (item._itemType === 'collection') {
            html += renderUnifiedCollection(item);
        } else if (item._itemType === 'series') {
            html += renderUnifiedSeries(item);
        } else if (item._itemType === 'movie') {
            html += renderUnifiedMovie(item);
        }
    }
    html += '</div>';
    container.innerHTML = html;
    setTimeout(() => {
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = function(e) {
                e.stopPropagation();
                const type = btn.getAttribute('data-type');
                const id = btn.getAttribute('data-id');
                removeFromWatchlist(type, id);
            };
        });
        
        // Add event listeners for clickable areas (poster, title, meta)
        document.querySelectorAll('.clickable-area').forEach(area => {
            // Skip if element already has an onclick handler (like episodes)
            if (area.onclick) {
                return;
            }
            
            area.onclick = function(e) {
                e.stopPropagation();
                const type = area.getAttribute('data-type');
                let id = area.getAttribute('data-id');
                
                // Find the item data from currentWatchlistData
                let itemData = null;
                if (currentWatchlistData) {
                    if (type === 'movie') {
                        // Look in standalone movies and collection items
                        itemData = currentWatchlistData.movies?.find(m => m.id == id);
                        if (!itemData) {
                            // Look in collections
                            for (const collection of currentWatchlistData.collections || []) {
                                itemData = collection.items?.find(m => m.id == id);
                                if (itemData) break;
                            }
                        }
                    } else if (type === 'series') {
                        itemData = currentWatchlistData.series?.find(s => s.id == id);
                    } else if (type === 'collection') {
                        itemData = currentWatchlistData.collections?.find(c => c.id == id);
                    } else if (type === 'season') {
                        // For seasons, we need to construct the season data
                        const seriesId = area.getAttribute('data-series-id');
                        const seasonNumber = area.getAttribute('data-season');
                        const series = currentWatchlistData.series?.find(s => s.id == seriesId);
                        if (series && series.episodes) {
                            const seasonEpisodes = series.episodes.filter(ep => ep.season_number == seasonNumber);
                            const seasonPoster = getSeasonPoster(seriesId, seasonNumber);
                            const seasonId = `${seriesId}-${seasonNumber}`; // Create a unique ID for the season
                            itemData = {
                                id: seasonId,
                                seriesId: seriesId,
                                seasonNumber: parseInt(seasonNumber),
                                episodes: seasonEpisodes,
                                poster: seasonPoster,
                                totalCount: seasonEpisodes.length,
                                watchedCount: seasonEpisodes.filter(ep => ep.watched).length
                            };
                            // Override the id for seasons since they don't have data-id attribute
                            id = seasonId;
                        }
                    }
                }
                
                // Debug logging to see what data we found
                console.log('🔍 Found itemData for movie:', itemData);
                console.log('🔍 itemData overview field:', itemData?.overview);
                console.log('🔍 itemData keys:', itemData ? Object.keys(itemData) : 'null');
                
                showDetails(type, id, itemData);
            };
        });
    }, 0);
}

function getReleaseDate(item) {
    if (!item) return '9999-12-31';
    
    let releaseDate = '';
    if (item._itemType === 'collection') {
        // For collections, use the most recent release date from all movies
        if (item.items && item.items.length > 0) {
            const releaseDates = item.items
                .map(m => m.release_date)
                .filter(date => date && date !== '')
                .map(date => new Date(date))
                .filter(date => !isNaN(date.getTime()));
            
            if (releaseDates.length > 0) {
                const mostRecentDate = new Date(Math.max(...releaseDates));
                releaseDate = mostRecentDate.toISOString().split('T')[0];
            }
        }
    } else if (item._itemType === 'series') {
        // For series, use the most recent episode air date
        if (item.episodes && item.episodes.length > 0) {
            const airDates = item.episodes
                .map(ep => ep.air_date)
                .filter(date => date && date !== '')
                .map(date => new Date(date))
                .filter(date => !isNaN(date.getTime()));
            
            if (airDates.length > 0) {
                const mostRecentDate = new Date(Math.max(...airDates));
                releaseDate = mostRecentDate.toISOString().split('T')[0];
            }
        }
    } else if (item._itemType === 'movie') {
        releaseDate = item.release_date || '';
    }
    
    // Return a sortable string - empty dates should sort last
    if (!releaseDate || releaseDate === '') {
        return '9999-12-31'; // Far future date for empty dates
    }
    
    // Ensure the date is in a valid format
    try {
        const date = new Date(releaseDate);
        if (isNaN(date.getTime())) {
            return '9999-12-31'; // Invalid date
        }
        return releaseDate;
    } catch (e) {
        console.warn('Invalid release date:', releaseDate, 'for item:', item.title);
        return '9999-12-31'; // Invalid date
    }
}

// --- Unified Renderers with Consistent Alignment ---
function renderUnifiedCollection(collection) {
    // If collection has exactly 1 movie, render as a regular movie row with a subtle collection hint
    if (collection.items && collection.items.length === 1) {
        const movie = collection.items[0];
        const isNewMovie = isItemNew('movie', movie.id);
        const newBadgeMovie = isNewMovie ? '<span class="new-badge">🆕</span>' : '';
        const isNewlyImported = isItemNewlyImported('movie', movie.id);
        console.log(`🎯 Movie ${movie.id} (${movie.title}) - isNewlyImported: ${isNewlyImported}`);
        const newlyImportedBadge = isNewlyImported ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
        let qualityBadge = '';
        if (movie.quality) {
            const qualityConfig = {
                'SD': { label: 'SD', bgColor: '#6c757d', textColor: '#ffffff' },
                'HD': { label: 'HD', bgColor: '#FFD700', textColor: '#000000' },
                '4K': { label: '4K', bgColor: '#C0C0C0', textColor: '#000000' }
            };
            const config = qualityConfig[movie.quality] || qualityConfig['SD'];
            qualityBadge = `
                <span class="quality-badge quality-${movie.quality.toLowerCase()}" title="Available in Jellyfin (${movie.quality})">
                    <div class="quality-label">${config.label}</div>
                </span>`;
        }
        return `
        <div class="watchlist-row ${isNewMovie ? 'new-item' : ''}">
            <input type="checkbox" class="checkbox" data-type="movie" data-id="${movie.id}" ${movie.watched ? 'checked' : ''}>
            <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                                    <div class="title">${movie.title}${newBadgeMovie}${newlyImportedBadge}</div>
            <div class="meta">${qualityBadge}Movie${movie.release_date ? ' • ' + new Date(movie.release_date).getFullYear() : ''} • Part of ${collection.title}</div>
            <span title="Remove" class="remove-btn" data-type="movie" data-id="${movie.id}" style="margin-left:auto;display:inline-block;">
                <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
        </div>`;
    }
    const isExpanded = watchlistState.expandedCollections[collection.id] || false;
    const allWatched = collection.items.every(m => m.watched);
    const someWatched = collection.items.some(m => m.watched);
    const unwatchedCount = collection.items.filter(m => !m.watched).length;
    const isNew = isItemNew('collection', collection.id);
    const newBadge = isNew ? '<span class="new-badge">🆕</span>' : '';
    
    // Check if any movie in the collection is newly imported
    const hasNewlyImportedMovies = collection.items.some(movie => isItemNewlyImported('movie', movie.id));
    const newlyImportedBadge = hasNewlyImportedMovies ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
    
    // Determine checkbox state for mixed collections
    let checkboxState = '';
    let checkboxClass = 'checkbox';
    if (allWatched) {
        checkboxState = 'checked';
    } else if (someWatched) {
        // For mixed state, add a special class and make it indeterminate
        checkboxClass = 'checkbox mixed-state';
    }
    
    let html = `<div class="watchlist-row collection-row ${isNew ? 'new-item' : ''}" data-collection-id="${collection.id}">
        <input type="checkbox" class="${checkboxClass}" data-type="collection" data-id="${collection.id}" ${checkboxState}>
        <div class="clickable-area" data-type="collection" data-id="${collection.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <img src="${collection.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="title">${collection.title}${newBadge}${newlyImportedBadge}</div>
            <div class="meta">Collection (${collection.items.length} movies; ${unwatchedCount} unwatched)</div>
        </div>
        <button class="expand-arrow" onclick="toggleCollection('${collection.id}')" style="margin-left: 8px;">${isExpanded ? '▼' : '▶'}</button>
        <span title="Remove" class="remove-btn" data-type="collection" data-id="${collection.id}" style="margin-left: 10px; display: inline-block;">
            <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
    </div>`;
    // Always render collection items container, but hide it if not expanded
    if (collection.items && collection.items.length > 0) {
        html += `<div class="collection-episodes" style="display: ${isExpanded ? 'block' : 'none'};">`;
        // Filter items based on unwatched filter
        const itemsToShow = watchlistFilters.unwatched ? 
            collection.items.filter(movie => !movie.watched) : 
            collection.items;
        
        for (const movie of itemsToShow) {
            const isNew = isItemNew('movie', movie.id);
            const newBadge = isNew ? '<span class="new-badge">🆕</span>' : '';
            const isNewlyImported = isItemNewlyImported('movie', movie.id);
            const newlyImportedBadge = isNewlyImported ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
            
            // Quality badge for Jellyfin movies
            let qualityBadge = '';
            if (movie.quality) {
                const qualityConfig = {
                    'SD': { label: 'SD', bgColor: '#6c757d', textColor: '#ffffff' },
                    'HD': { label: 'HD', bgColor: '#FFD700', textColor: '#000000' },
                    '4K': { label: '4K', bgColor: '#C0C0C0', textColor: '#000000' }
                };
                
                const config = qualityConfig[movie.quality] || qualityConfig['SD'];
                qualityBadge = `
                    <span class="quality-badge quality-${movie.quality.toLowerCase()}" title="Available in Jellyfin (${movie.quality})">
                        <div class="quality-label">${config.label}</div>
                    </span>`;
            }
            
            html += `<div class="watchlist-row ${isNew ? 'new-item' : ''}">
                <input type="checkbox" class="checkbox" data-type="movie" data-id="${movie.id}" ${movie.watched ? 'checked' : ''}>
                <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                <div class="title">${movie.title}${newBadge}${newlyImportedBadge}</div>
                <div class="meta">${qualityBadge}Movie${movie.release_date ? ' • ' + new Date(movie.release_date).getFullYear() : ''}</div>
                <span title="Remove" class="remove-btn" data-type="movie" data-id="${movie.id}" style="margin-left:auto;display:inline-block;">
                    <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </span>
            </div>`;
        }
        html += '</div>';
    }
    return html;
}

// Group episodes by season
function groupEpisodesBySeason(episodes) {
    const seasonMap = {};
    
    episodes.forEach(episode => {
        const seasonNumber = episode.season_number || 0;
        if (!seasonMap[seasonNumber]) {
            seasonMap[seasonNumber] = {
                seasonNumber: seasonNumber,
                episodes: [],
                watchedCount: 0,
                totalCount: 0
            };
        }
        seasonMap[seasonNumber].episodes.push(episode);
        seasonMap[seasonNumber].totalCount++;
        if (episode.watched) {
            seasonMap[seasonNumber].watchedCount++;
        }
    });
    
    // Convert to array and sort by season number
    return Object.values(seasonMap).sort((a, b) => a.seasonNumber - b.seasonNumber);
}

// Render a season row with episodes
function renderSeasonRow(season, seriesId) {
    const isExpanded = watchlistState.expandedSeasons[`${seriesId}-${season.seasonNumber}`] || false;
    const unwatchedCount = season.totalCount - season.watchedCount;
    const seasonKey = `${seriesId}-${season.seasonNumber}`;
    
    // Get season poster (for now, we'll use a generic season icon, but this could be enhanced)
    const seasonPoster = getSeasonPoster(seriesId, season.seasonNumber);
    
    // Calculate if season is watched (all episodes watched)
    const isSeasonWatched = season.watchedCount === season.totalCount;
    
    let html = `<div class="season-row" data-series-id="${seriesId}" data-season="${season.seasonNumber}" style="margin-left: 20px; background: rgba(255,255,255,0.02); border-left: 3px solid rgba(255,255,255,0.1); display: flex; align-items: center; padding: 8px;">
        <input type="checkbox" class="checkbox" data-type="season" data-series-id="${seriesId}" data-season="${season.seasonNumber}" ${isSeasonWatched ? 'checked' : ''} style="margin-right: 12px;">
        <div class="clickable-area" data-type="season" data-series-id="${seriesId}" data-season="${season.seasonNumber}" onclick="handleSeasonClick('${seriesId}', ${season.seasonNumber})" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <img src="${seasonPoster}" alt="Season ${season.seasonNumber}" class="watchlist-thumb" style="width: 40px; height: 60px; object-fit: cover; border-radius: 4px;" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div style="margin-left: 12px; flex: 1;">
                <div class="title" style="font-size: 0.9em; color: #ffffff;">Season ${season.seasonNumber}</div>
                <div class="meta" style="font-size: 0.8em; color: #cccccc;">${season.totalCount} episodes • ${unwatchedCount} unwatched</div>
            </div>
        </div>
        <button class="expand-arrow" onclick="toggleSeason('${seasonKey}')" style="margin-left: 8px; background: none; border: none; color: #ffffff; cursor: pointer; padding: 8px;">${isExpanded ? '▼' : '▶'}</button>
    </div>`;
    
    // Render episodes if expanded - OUTSIDE the season row
    if (isExpanded) {
        html += `<div class="season-episodes" style="margin-left: 40px; background: rgba(255,255,255,0.01); border-left: 2px solid rgba(255,255,255,0.05); display: block;">`;
        
        // Filter episodes based on unwatched filter
        const episodesToShow = watchlistFilters.unwatched ? 
            season.episodes.filter(ep => !ep.watched) : 
            season.episodes;
        
        for (const ep of episodesToShow) {
            html += renderEpisodeRow(ep, seriesId);
        }
        html += '</div>';
    }
    
    return html;
}

// Get season poster from series data
function getSeasonPoster(seriesId, seasonNumber) {
    // Find the series in current watchlist data
    const series = currentWatchlistData?.series?.find(s => s.id == seriesId);
    console.log(`🔍 Getting season poster for series ${seriesId}, season ${seasonNumber}`);
    console.log(`🔍 Series found:`, series ? 'Yes' : 'No');
    console.log(`🔍 Series season_posters:`, series?.season_posters);
    console.log(`🔍 Looking for season ${seasonNumber} in:`, series?.season_posters ? Object.keys(series.season_posters) : 'No season_posters');
    
    if (series && series.season_posters && series.season_posters[seasonNumber]) {
        console.log(`✅ Found season poster: ${series.season_posters[seasonNumber]}`);
        return series.season_posters[seasonNumber];
    }
    console.log(`❌ No season poster found, using fallback`);
    // Fallback to no-image if no season poster available
    return '/static/no-image.png';
}

function renderUnifiedSeries(series) {
    const isExpanded = watchlistState.expandedSeries[series.id] || false;
    const isNew = isItemNew('series', series.id);
    const newBadge = isNew ? '<span class="new-badge">🆕</span>' : '';
    const isNewlyImported = isItemNewlyImported('series', series.id);
    const newlyImportedBadge = isNewlyImported ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
    const episodeCount = series.episodes ? series.episodes.length : 0;
    const unwatchedCount = series.episodes ? series.episodes.filter(ep => !ep.watched).length : 0;
    
    // Debug season poster data
    console.log(`🔍 Series ${series.id} (${series.title}) season_posters:`, series.season_posters);
    console.log(`🔍 Series ${series.id} IMDB ID:`, series.imdb_id);
    let html = `<div class="watchlist-row series-row ${isNew ? 'new-item' : ''}" data-series-id="${series.id}">
        <input type="checkbox" class="checkbox" data-type="series" data-id="${series.id}" ${series.watched ? 'checked' : ''}>
        <div class="clickable-area" data-type="series" data-id="${series.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <img src="${series.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="title">${series.title}${newBadge}${newlyImportedBadge}</div>
            <div class="meta">TV Series (${episodeCount} episodes; ${unwatchedCount} unwatched)</div>
        </div>
        <button class="expand-arrow" onclick="toggleSeries('${series.id}')" style="margin-left: 8px;">${isExpanded ? '▼' : '▶'}</button>
        <span title="Remove" class="remove-btn" data-type="series" data-id="${series.id}" style="margin-left: 10px; display: inline-block;">
            <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
    </div>`;
    
    // Always render seasons container, but hide it if not expanded
    if (series.episodes && series.episodes.length > 0) {
        html += `<div class="series-seasons" style="display: ${isExpanded ? 'block' : 'none'};">`;
        
        // Group episodes by season
        const seasons = groupEpisodesBySeason(series.episodes);
        
        // Filter seasons based on unwatched filter
        const seasonsToShow = watchlistFilters.unwatched ? 
            seasons.filter(season => season.episodes.some(ep => !ep.watched)) : 
            seasons;
        
        for (const season of seasonsToShow) {
            html += renderSeasonRow(season, series.id);
        }
        html += '</div>';
    }
    return html;
}

function renderUnifiedMovie(movie) {
    const isNew = isItemNew('movie', movie.id);
    const newBadge = isNew ? '<span class="new-badge">🆕</span>' : '';
    const isNewlyImported = isItemNewlyImported('movie', movie.id);
    const newlyImportedBadge = isNewlyImported ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
    
    // Quality badge for Jellyfin movies
    let qualityBadge = '';
    if (movie.quality) {
        const qualityConfig = {
            'SD': { 
                label: 'SD', 
                bgColor: '#6c757d',
                textColor: '#ffffff'
            },
            'HD': { 
                label: 'HD', 
                bgColor: '#FFD700',
                textColor: '#000000'
            },
            '4K': { 
                label: '4K', 
                bgColor: '#C0C0C0',
                textColor: '#000000'
            }
        };
        
        const config = qualityConfig[movie.quality] || qualityConfig['SD'];
        qualityBadge = `
            <span class="quality-badge quality-${movie.quality.toLowerCase()}" title="Available in Jellyfin (${movie.quality})">
                <div class="quality-label">${config.label}</div>
            </span>`;
    }
    
    return `<div class="watchlist-row ${isNew ? 'new-item' : ''}">
        <input type="checkbox" class="checkbox" data-type="movie" data-id="${movie.id}" ${movie.watched ? 'checked' : ''}>
        <div class="clickable-area" data-type="movie" data-id="${movie.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="title">${movie.title}${newBadge}${newlyImportedBadge}</div>
            <div class="meta">${qualityBadge}Movie${movie.release_date ? ' • ' + new Date(movie.release_date).getFullYear() : ''}</div>
        </div>
        <span title="Remove" class="remove-btn" data-type="movie" data-id="${movie.id}" style="margin-left: 8px; display: inline-block;">
            <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
    </div>`;
}

// For episodes, if you want to add a remove icon, add it here. If not supported, gray out or hide the icon.
function renderEpisodeRow(ep, seriesId) {
    const watchedClass = ep.watched ? 'watched-row' : '';
    // Use data attributes instead of inline onchange
    return `<div class="episode-row ${watchedClass}" style="display: flex; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
        <input type="checkbox" class="checkbox episode-checkbox" data-series-id="${seriesId}" data-season="${ep.season_number}" data-episode="${ep.episode_number}" ${ep.watched ? 'checked' : ''} style="margin-right: 12px;">
        <div class="clickable-area" data-type="episode" data-series-id="${seriesId}" data-season="${ep.season_number}" data-episode="${ep.episode_number}" onclick="handleEpisodeClick('${seriesId}', ${ep.season_number}, ${ep.episode_number})" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <div style="flex: 1;">
                <div class="title" style="font-size: 0.9em; color: ${ep.watched ? '#666666' : '#ffffff'}; text-decoration: ${ep.watched ? 'line-through' : 'none'}; margin-bottom: 2px;">S${ep.season_number}E${ep.episode_number}: ${ep.title}</div>
                <div class="meta" style="font-size: 0.8em; color: #cccccc;">${ep.air_date || ''}</div>
            </div>
        </div>
        <span title="Remove (not supported)" style="margin-left:auto;display:inline-block;opacity:0.3;cursor:not-allowed;">
            <svg class="remove-icon" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
    </div>`;
}



async function toggleCollection(collectionId) {
    console.log('toggleCollection called with ID:', collectionId);
    
    // Store current scroll position
    const scrollPosition = window.scrollY;
    
    // Toggle the expanded state
    watchlistState.expandedCollections[collectionId] = !watchlistState.expandedCollections[collectionId];
    console.log('Expanded state for collection', collectionId, ':', watchlistState.expandedCollections[collectionId]);
    
    // Mark as interacted if expanding
    if (watchlistState.expandedCollections[collectionId]) {
        await markAsInteracted('collection', collectionId);
        // Mark as seen if it was new
        if (isItemNew('collection', collectionId)) {
            await markItemAsSeen('collection', collectionId);
        }
    }
    
    // Find the collection element first
    const collectionElement = document.querySelector(`[data-collection-id="${collectionId}"]`);
    if (!collectionElement) {
        console.warn(`Collection element not found for ID: ${collectionId}`);
        window.scrollTo(0, scrollPosition);
        return;
    }
    
    // Update the arrow immediately
    const arrowBtn = collectionElement.querySelector('.expand-arrow');
    if (arrowBtn) {
        arrowBtn.textContent = watchlistState.expandedCollections[collectionId] ? '▼' : '▶';
    }
    
    // Handle the episodes container - just toggle visibility
    const existingEpisodesContainer = collectionElement.nextElementSibling;
    const isExpanded = watchlistState.expandedCollections[collectionId];
    
    if (existingEpisodesContainer && existingEpisodesContainer.classList.contains('collection-episodes')) {
        existingEpisodesContainer.style.display = isExpanded ? 'block' : 'none';
    }
    
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
}

async function toggleSeries(seriesId) {
    // Store current scroll position
    const scrollPosition = window.scrollY;
    
    // Toggle the expanded state
    watchlistState.expandedSeries[seriesId] = !watchlistState.expandedSeries[seriesId];
    
    // Mark as interacted if expanding
    if (watchlistState.expandedSeries[seriesId]) {
        await markAsInteracted('series', seriesId);
        // Mark as seen if it was new
        if (isItemNew('series', seriesId)) {
            await markItemAsSeen('series', seriesId);
        }
    }
    
    // Find the series element and update just the arrow and episodes container
    const seriesElement = document.querySelector(`[data-series-id="${seriesId}"]`);
    if (seriesElement) {
        // Update just the arrow button
        const arrowBtn = seriesElement.querySelector('.expand-arrow');
        if (arrowBtn) {
            arrowBtn.textContent = watchlistState.expandedSeries[seriesId] ? '▼' : '▶';
        }
        
        // Handle seasons container - just toggle visibility
        const seasonsContainer = seriesElement.nextElementSibling;
        const isExpanded = watchlistState.expandedSeries[seriesId];
        
        if (seasonsContainer && seasonsContainer.classList.contains('series-seasons')) {
            seasonsContainer.style.display = isExpanded ? 'block' : 'none';
        }
    }
    
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
}

// Toggle season expansion
function toggleSeason(seasonKey) {
    console.log('🔄 Toggling season:', seasonKey);
    
    // Toggle the expanded state
    watchlistState.expandedSeasons[seasonKey] = !watchlistState.expandedSeasons[seasonKey];
    
    // Find the season element and update just the arrow and episodes container
    const [seriesId, seasonNumber] = seasonKey.split('-');
    const seasonElement = document.querySelector(`[data-series-id="${seriesId}"][data-season="${seasonNumber}"]`);
    
    if (seasonElement) {
        // Update the arrow button
        const arrowBtn = seasonElement.querySelector('.expand-arrow');
        if (arrowBtn) {
            arrowBtn.textContent = watchlistState.expandedSeasons[seasonKey] ? '▼' : '▶';
        }
        
        // Toggle episodes container visibility
        const episodesContainer = seasonElement.querySelector('.season-episodes');
        const isExpanded = watchlistState.expandedSeasons[seasonKey];
        
        if (episodesContainer) {
            episodesContainer.style.display = isExpanded ? 'block' : 'none';
        } else if (isExpanded) {
            // If episodes container doesn't exist but we're expanding, we need to re-render just this season
            // This should only happen if the season was never expanded before
            const series = currentWatchlistData?.series?.find(s => s.id == seriesId);
            if (series) {
                const seasonEpisodes = series.episodes.filter(ep => ep.season_number == seasonNumber);
                if (seasonEpisodes.length > 0) {
                    // Re-render just this season's episodes
                    const seasonData = {
                        seriesId: seriesId,
                        seasonNumber: seasonNumber,
                        episodes: seasonEpisodes
                    };
                    const episodesHtml = renderSeasonEpisodes(seasonData);
                    seasonElement.insertAdjacentHTML('beforeend', episodesHtml);
                }
            }
        }
    }
}

// Render episodes for a season
function renderSeasonEpisodes(seasonData) {
    const { seriesId, seasonNumber, episodes } = seasonData;
    let html = `<div class="season-episodes" style="display: block;">`;
    
    // Filter episodes based on unwatched filter
    const episodesToShow = watchlistFilters.unwatched ? 
        episodes.filter(ep => !ep.watched) : 
        episodes;
    
    for (const ep of episodesToShow) {
        html += renderEpisodeRow(ep, seriesId);
    }
    
    html += '</div>';
    return html;
}

// Handle season click to open season details
function handleSeasonClick(seriesId, seasonNumber) {
    console.log('🎬 Season clicked:', { seriesId, seasonNumber });
    
    // Find the series and construct season data
    const series = currentWatchlistData?.series?.find(s => s.id == seriesId);
    if (series && series.episodes) {
        const seasonEpisodes = series.episodes.filter(ep => ep.season_number == seasonNumber);
        const seasonPoster = getSeasonPoster(seriesId, seasonNumber);
        const itemData = {
            id: `${seriesId}-${seasonNumber}`,
            seriesId: seriesId,
            seasonNumber: parseInt(seasonNumber),
            episodes: seasonEpisodes,
            poster: seasonPoster,
            totalCount: seasonEpisodes.length,
            watchedCount: seasonEpisodes.filter(ep => ep.watched).length
        };
        
        console.log('🎬 Opening season details for:', itemData);
        showDetails('season', `${seriesId}-${seasonNumber}`, itemData);
    }
}

// Handle episode click to open episode details
async function handleEpisodeClick(seriesId, seasonNumber, episodeNumber) {
    console.log('🎬 Episode clicked:', { seriesId, seasonNumber, episodeNumber });
    
    // Find the episode data
    const series = currentWatchlistData?.series?.find(s => s.id == seriesId);
    if (series && series.episodes) {
        const episode = series.episodes.find(ep => 
            ep.season_number == seasonNumber && ep.episode_number == episodeNumber
        );
        
        if (episode) {
            console.log('🔍 Found episode:', episode);
            console.log('🔍 Episode properties:', Object.keys(episode));
            
            // Show loading state
            const loadingOverlay = document.createElement('div');
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            `;
            loadingOverlay.innerHTML = `
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 24px; border-radius: 12px; text-align: center; color: #ffffff;">
                    <div style="font-size: 18px; margin-bottom: 12px;">Loading episode details...</div>
                    <div style="font-size: 14px; color: #888;">${episode.title}</div>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
            
            try {
                // Fetch enhanced episode details from backend
                const authHeaders = getAuthHeaders();
                console.log('🔑 Auth headers for episode details:', authHeaders);
                
                const response = await fetch(`/api/episodes/${episode.id}/details`, {
                    headers: authHeaders
                });
                
                console.log('📡 Episode details response status:', response.status);
                
                if (response.ok) {
                    const enhancedEpisodeData = await response.json();
                    console.log('✅ Enhanced episode data received:', enhancedEpisodeData);
                    
                    // Remove loading overlay
                    loadingOverlay.remove();
                    
                    // Create itemData with enhanced data
                    const itemData = {
                        id: enhancedEpisodeData.id,
                        seriesId: enhancedEpisodeData.series_id,
                        seasonNumber: enhancedEpisodeData.season_number,
                        episodeNumber: enhancedEpisodeData.episode_number,
                        title: enhancedEpisodeData.title,
                        airDate: enhancedEpisodeData.air_date,
                        watched: enhancedEpisodeData.watched,
                        seriesTitle: enhancedEpisodeData.series_title,
                        overview: enhancedEpisodeData.overview,
                        still_path: enhancedEpisodeData.still_path,
                        runtime: enhancedEpisodeData.runtime,
                        vote_average: enhancedEpisodeData.vote_average,
                        vote_count: enhancedEpisodeData.vote_count
                    };
                    
                    console.log('🎬 Opening episode details for:', itemData);
                    showDetails('episode', episode.id, itemData);
                } else if (response.status === 404) {
                    console.log('❌ Episode not found (404)');
                    loadingOverlay.remove();
                    showError('Episode not found');
                } else if (response.status === 403) {
                    console.log('❌ Forbidden (403)');
                    loadingOverlay.remove();
                    showError('Access denied');
                } else {
                    console.log('❌ Error fetching episode details:', response.status);
                    loadingOverlay.remove();
                    showError('Failed to load episode details');
                }
            } catch (error) {
                console.error('❌ Error fetching episode details:', error);
                loadingOverlay.remove();
                showError('Failed to load episode details');
            }
        } else {
            console.log('❌ Episode not found for:', { seriesId, seasonNumber, episodeNumber });
            console.log('🔍 Available episodes:', series.episodes.map(ep => ({ 
                season: ep.season_number, 
                episode: ep.episode_number, 
                title: ep.title 
            })));
        }
    }
}

async function toggleWatched(type, id) {
    console.log(`toggleWatched called with type: ${type}, id: ${id}`);
    
    // Find the checkbox that was clicked using event delegation
    const event = window.event || arguments.callee.caller.arguments[0];
    const clickedCheckbox = event ? event.target : null;
    
    if (!clickedCheckbox || clickedCheckbox.type !== 'checkbox') {
        console.error('Could not find the clicked checkbox');
        return;
    }
    
    // Store the original state in case we need to revert
    const originalState = clickedCheckbox.checked;
    const row = clickedCheckbox.closest('.watchlist-row');
    
    // Special handling for collections with confirmation dialog
    if (type === 'collection') {
        const collectionElement = document.querySelector(`[data-collection-id="${id}"]`);
        if (collectionElement) {
            const collectionTitle = collectionElement.querySelector('.title')?.textContent || 'this collection';
            
            // Check if collection has mixed state (some watched, some unwatched)
            const episodesContainer = collectionElement.nextElementSibling;
            if (episodesContainer && episodesContainer.classList.contains('collection-episodes')) {
                const childCheckboxes = episodesContainer.querySelectorAll('.checkbox');
                const watchedCount = Array.from(childCheckboxes).filter(cb => cb.checked).length;
                const totalCount = childCheckboxes.length;
                
                // If collection has mixed state, show confirmation dialog
                if (watchedCount > 0 && watchedCount < totalCount) {
                    const action = originalState ? 'unwatch' : 'watch';
                    const message = `Mark all ${totalCount} items in "${collectionTitle}" as ${action === 'watch' ? 'watched' : 'unwatched'}?`;
                    
                    if (!confirm(message)) {
                        return; // User cancelled
                    }
                }
            }
        }
    }
    
    // Optimistically update the UI
    const newState = !originalState;
    clickedCheckbox.checked = newState;
    
    if (row) {
        if (newState) {
            row.classList.add('watched-row');
        } else {
            row.classList.remove('watched-row');
        }
    }
    
    // Special handling for collections
    if (type === 'collection') {
        const collectionElement = document.querySelector(`[data-collection-id="${id}"]`);
        if (collectionElement) {
            const collectionCheckbox = collectionElement.querySelector('.checkbox');
            if (collectionCheckbox) {
                collectionCheckbox.checked = newState;
            }
            
            const episodesContainer = collectionElement.nextElementSibling;
            if (episodesContainer && episodesContainer.classList.contains('collection-episodes')) {
                const childCheckboxes = episodesContainer.querySelectorAll('.checkbox');
                childCheckboxes.forEach(checkbox => {
                    checkbox.checked = newState;
                    const childRow = checkbox.closest('.watchlist-row');
                    if (childRow) {
                        if (newState) {
                            childRow.classList.add('watched-row');
                        } else {
                            childRow.classList.remove('watched-row');
                        }
                    }
                });
            }
        }
    }
    
    try {
        // Make API call to toggle watched status
        const response = await fetch(`${API_BASE}/watchlist/${type}/${id}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Toggle response:', result);
            
            // Update checkbox state based on server response
            clickedCheckbox.checked = result.watched;
            
            // Update row styling
            if (row) {
                if (result.watched) {
                    row.classList.add('watched-row');
                } else {
                    row.classList.remove('watched-row');
                }
            }
            
            // Special handling for collections
            if (type === 'collection') {
                const collectionElement = document.querySelector(`[data-collection-id="${id}"]`);
                if (collectionElement) {
                    const collectionCheckbox = collectionElement.querySelector('.checkbox');
                    if (collectionCheckbox) {
                        collectionCheckbox.checked = result.watched;
                        // Remove mixed state class since all items are now in the same state
                        collectionCheckbox.classList.remove('mixed-state');
                    }
                    
                    const episodesContainer = collectionElement.nextElementSibling;
                    if (episodesContainer && episodesContainer.classList.contains('collection-episodes')) {
                        const childCheckboxes = episodesContainer.querySelectorAll('.checkbox');
                        childCheckboxes.forEach(checkbox => {
                            checkbox.checked = result.watched;
                            const childRow = checkbox.closest('.watchlist-row');
                            if (childRow) {
                                if (result.watched) {
                                    childRow.classList.add('watched-row');
                                } else {
                                    childRow.classList.remove('watched-row');
                                }
                            }
                        });
                    }
                }
            }
            
            // Update collection checkbox state if this was a movie in a collection
            if (type === 'movie') {
                updateCollectionCheckboxState(id);
            }
            
            // Mark as interacted when user checks/unchecks
            await markAsInteracted(type, id);
            
            // Mark as seen if it was new
            if (isItemNew(type, id)) {
                await markItemAsSeen(type, id);
            }
            
        } else {
            console.error('Failed to toggle watched status');
            
            // Queue the change for offline sync if we're offline
            if (!isOnline) {
                await queueChange({
                    url: `${API_BASE}/watchlist/${type}/${id}/toggle`,
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({})
                });
                showWarning('Change queued for sync when online');
            } else {
                showError('Failed to update watched status');
                // Revert to original state on error
                clickedCheckbox.checked = originalState;
            }
        }
    } catch (error) {
        console.error('Error toggling watched status:', error);
        
        // Queue the change for offline sync if we're offline
        if (!isOnline) {
            await queueChange({
                url: `${API_BASE}/watchlist/${type}/${id}/toggle`,
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({})
            });
            showWarning('Change queued for sync when online');
        } else {
            showError('Failed to update watched status: ' + error.message);
            // Revert to original state on error
            clickedCheckbox.checked = originalState;
        }
    }
}

async function markAsInteracted(type, id) {
    try {
        const response = await fetch(`${API_BASE}/watchlist/${type}/${id}/interacted`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            console.log(`Marked ${type} ${id} as interacted`);
        } else {
            console.error(`Failed to mark ${type} ${id} as interacted`);
        }
    } catch (error) {
        console.error(`Error marking ${type} ${id} as interacted:`, error);
    }
}

async function removeFromWatchlist(type, id) {
    // Debug logging to see what we're working with
    console.log('🔍 removeFromWatchlist called with:', { type, id });
    console.log('🔍 currentWatchlistData:', currentWatchlistData);
    console.log('🔍 window.lastWatchlistData:', window.lastWatchlistData);
    
    if (type === 'collection') {
        if (!confirm('Are you sure you want to remove this entire collection and all its movies from your watchlist?')) return;
        // Find the collection in the current watchlist data
        const container = document.getElementById('watchlistContent');
        // Try to find the collection row in the DOM and get its data-id
        // Instead, use the last loaded data (from the last render)
        if (!window.lastWatchlistData) {
            showError('Could not find collection data. Please refresh and try again.');
            return;
        }
        const collection = (window.lastWatchlistData.collections || []).find(c => c.id == id);
        if (!collection) {
            showError('Collection not found.');
            return;
        }
        // Remove all movies in the collection
        let failed = false;
        for (const movie of collection.items) {
            try {
                const response = await fetch(`${API_BASE}/watchlist/movie/${movie.id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                if (!response.ok) failed = true;
            } catch (e) {
                failed = true;
            }
        }
        if (!failed) {
            showSuccess('Collection removed from watchlist');
        } else {
            showError('Some movies could not be removed from the collection');
        }
        loadWatchlist();
        return;
    }
    
    // For movies and series, try to find the item in multiple data sources
    let itemData = null;
    
    // Try currentWatchlistData first
    if (currentWatchlistData) {
        itemData = currentWatchlistData.movies?.find(m => m.id == id) || 
                   currentWatchlistData.series?.find(s => s.id == id);
    }
    
    // If not found, try lastWatchlistData
    if (!itemData && window.lastWatchlistData) {
        itemData = window.lastWatchlistData.movies?.find(m => m.id == id) || 
                   window.lastWatchlistData.series?.find(s => s.id == id);
    }
    
    // If still not found, try to find in collections
    if (!itemData && (currentWatchlistData?.collections || window.lastWatchlistData?.collections)) {
        const collections = currentWatchlistData?.collections || window.lastWatchlistData?.collections || [];
        for (const collection of collections) {
            itemData = collection.items?.find(m => m.id == id);
            if (itemData) break;
        }
    }
    
    console.log('🔍 Found itemData for removal:', itemData);
    
    if (!itemData) {
        showError('Item not found. Please refresh and try again.');
        return;
    }
    
    // Check if item is in a collection
    const isInCollection = itemData.collection_id && itemData.collection_title;
    
    if (isInCollection) {
        // Show three-option dialog for items in collections
        const action = confirm(`"${itemData.title}" is in the "${itemData.collection_title}" collection.\n\nWhat would you like to do?\n\n• Click OK to DELETE the item completely\n• Click Cancel to keep it`);
        
        if (!action) return; // User cancelled
        
        // Show final confirmation for deletion
        if (!confirm(`Are you sure you want to DELETE "${itemData.title}"? This action cannot be undone.`)) return;
    } else {
        // Show simple confirmation for standalone items
        if (!confirm(`Are you sure you want to remove "${itemData.title}" from your watchlist?`)) return;
    }
    
    try {
        console.log(`[DEBUG] Attempting to delete ${type} with ID: ${id} (type: ${typeof id})`);
        const response = await fetch(`${API_BASE}/watchlist/${type}/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        console.log(`[DEBUG] Response status: ${response.status}`);
        if (response.ok) {
            showSuccess('Item removed from watchlist');
            loadWatchlist();
        } else {
            const errorText = await response.text();
            console.log(`[DEBUG] Error response: ${errorText}`);
            showError('Failed to remove item');
        }
    } catch (e) {
        console.log(`[DEBUG] Exception: ${e.message || e}`);
        showError('Failed to remove item: ' + (e.message || e));
    }
}

// showEpisodes function removed - not used in current UI

// Episode modal functions removed - not used in current UI

async function toggleEpisodeWatched(seriesId, seasonNumber, episodeNumber) {
    console.log('toggleEpisodeWatched called with:', { seriesId, seasonNumber, episodeNumber });
    
    // Find the checkbox by its data attributes
    const checkbox = document.querySelector(`.episode-checkbox[data-series-id="${seriesId}"][data-season="${seasonNumber}"][data-episode="${episodeNumber}"]`);
    console.log('Checkbox found:', checkbox);
    
    if (!checkbox || checkbox.type !== 'checkbox') {
        console.error('Could not find episode checkbox to toggle');
        return;
    }
    
    console.log('Making API call to toggle episode...');
    try {
        // Make API call to toggle episode status
        const response = await fetch(`${API_BASE}/series/${seriesId}/episodes/${seasonNumber}/${episodeNumber}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        console.log('API response status:', response.status);
        
        if (response.ok) {
            // Update the checkbox state based on server response
            const result = await response.json();
            console.log('API response:', result);
            checkbox.checked = result.watched;
            
            // Update the row styling
            const row = checkbox.closest('.episode-row');
            if (row) {
                if (checkbox.checked) {
                    row.classList.add('watched-row');
                } else {
                    row.classList.remove('watched-row');
                }
            }
            
            console.log('Episode checkbox toggled successfully');
        } else {
            console.error('Failed to toggle episode status');
            // Revert checkbox state on error
            checkbox.checked = !checkbox.checked;
        }
    } catch (error) {
        console.error('Error toggling episode status:', error);
        // Revert checkbox state on error
        checkbox.checked = !checkbox.checked;
    }
}

async function loadStats() {
    if (!checkAuth()) return;
    
    const container = document.getElementById('statsContent');
    container.innerHTML = '<div class="loading">Loading statistics...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            renderStats(data);
        } else {
            showError('Failed to load statistics');
        }
    } catch (e) {
        showError('Failed to load statistics: ' + (e.message || e));
    }
}

function renderStats(data) {
    const container = document.getElementById('statsContent');
    
    let html = '<div class="stats">';
    
    // Total items
    const totalItems = (data.total_movies || 0) + (data.total_series || 0);
    html += `<div class="stat-card">
        <h3>${totalItems}</h3>
        <p>Total Items</p>
    </div>`;
    
    // Movies
    html += `<div class="stat-card">
        <h3>${data.total_movies || 0}</h3>
        <p>Movies</p>
    </div>`;
    
    // Series
    html += `<div class="stat-card">
        <h3>${data.total_series || 0}</h3>
        <p>TV Series</p>
    </div>`;
    
    // Watched items
    const watchedItems = (data.watched_movies || 0) + (data.watched_series || 0);
    html += `<div class="stat-card">
        <h3>${watchedItems}</h3>
        <p>Watched</p>
    </div>`;
    
    // Unwatched items
    const unwatchedItems = totalItems - watchedItems;
    html += `<div class="stat-card">
        <h3>${unwatchedItems}</h3>
        <p>Unwatched</p>
    </div>`;
    
    // Completion percentage
    const completionPercentage = totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0;
    html += `<div class="stat-card">
        <h3>${completionPercentage}%</h3>
        <p>Completion</p>
    </div>`;
    
    html += '</div>';
    container.innerHTML = html;
}

function reloadWatchlist() {
    const sortSelect = document.getElementById('sortSelect');
    watchlistState.sortBy = sortSelect.value;
    loadWatchlist();
}



// Watch time filter functions
// Runtime filter functions removed as requested

// Enhanced filter state management
function updateFilterState() {
    try {
        // Ensure we have valid state before saving
        if (watchlistFilters && typeof watchlistFilters === 'object') {
            localStorage.setItem('watchlistFilters', JSON.stringify(watchlistFilters));
        }
        
        if (watchlistState && typeof watchlistState === 'object') {
            localStorage.setItem('watchlistState', JSON.stringify(watchlistState));
        }
        
        console.log('Filter state updated and saved:', { watchlistFilters, watchlistState });
    } catch (error) {
        console.error('Error saving filter state:', error);
        // Try to save just the essential data
        try {
            localStorage.setItem('watchlistFilters', JSON.stringify({ movies: true, series: true, unwatched: false }));
            localStorage.setItem('watchlistState', JSON.stringify({ sortBy: 'alphabetical' }));
        } catch (e) {
            console.error('Failed to save even basic filter state:', e);
        }
    }
}

function loadFilterState() {
    try {
        const savedFilters = localStorage.getItem('watchlistFilters');
        const savedState = localStorage.getItem('watchlistState');
        
        if (savedFilters) {
            try {
                const parsedFilters = JSON.parse(savedFilters);
                if (parsedFilters && typeof parsedFilters === 'object') {
                    watchlistFilters = { ...watchlistFilters, ...parsedFilters };
                } else {
                    console.warn('Invalid saved filters, using defaults');
                    setDefaultFilterState();
                }
            } catch (e) {
                console.error('Error parsing saved filters:', e);
                setDefaultFilterState();
            }
        }
        
        if (savedState) {
            try {
                const parsedState = JSON.parse(savedState);
                if (parsedState && typeof parsedState === 'object') {
                    watchlistState = { ...watchlistState, ...parsedState };
                } else {
                    console.warn('Invalid saved state, using defaults');
                    watchlistState.sortBy = 'alphabetical';
                }
            } catch (e) {
                console.error('Error parsing saved state:', e);
                watchlistState.sortBy = 'alphabetical';
            }
        }
        
        // Note: Removed forced filter resets that were preventing filters from working
        
        
    } catch (error) {
        console.error('Error loading filter state:', error);
        // Reset to defaults if there's an error
        setDefaultFilterState();
    }
}

// Update collection checkbox state based on its child movies
function updateCollectionCheckboxState(movieId) {
    // Find the movie's collection
    const movieRow = document.querySelector(`[data-type="movie"][data-id="${movieId}"]`);
    if (!movieRow) return;
    
    const collectionRow = movieRow.closest('.collection-episodes')?.previousElementSibling;
    if (!collectionRow || !collectionRow.classList.contains('collection-row')) return;
    
    const collectionId = collectionRow.getAttribute('data-collection-id');
    const collectionCheckbox = collectionRow.querySelector('.checkbox');
    if (!collectionCheckbox) return;
    
    // Get all child checkboxes
    const childCheckboxes = collectionRow.nextElementSibling?.querySelectorAll('.checkbox');
    if (!childCheckboxes || childCheckboxes.length === 0) return;
    
    const watchedCount = Array.from(childCheckboxes).filter(cb => cb.checked).length;
    const totalCount = childCheckboxes.length;
    
    // Update collection checkbox state
    if (watchedCount === 0) {
        // All unwatched
        collectionCheckbox.checked = false;
        collectionCheckbox.classList.remove('mixed-state');
    } else if (watchedCount === totalCount) {
        // All watched
        collectionCheckbox.checked = true;
        collectionCheckbox.classList.remove('mixed-state');
    } else {
        // Mixed state
        collectionCheckbox.checked = true;
        collectionCheckbox.classList.add('mixed-state');
    }
}

async function clearAllData() {
    if (!confirm('Are you sure you want to clear all data? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/watchlist/clear`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (response.ok) {
            showSuccess('All data cleared successfully');
            loadWatchlist();
        } else {
            showError('Failed to clear data');
        }
    } catch (e) {
        showError('Failed to clear data: ' + (e.message || e));
    }
}

async function getJellyfinLibraries() {
    try {
        const response = await fetch(`${API_BASE}/import/jellyfin/libraries-debug`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            return result.libraries || [];
        } else {
            console.error('Failed to get Jellyfin libraries');
            return [];
        }
    } catch (error) {
        console.error('Error getting Jellyfin libraries:', error);
        return [];
    }
}



async function importFromJellyfin() {
    console.log('🎬 importFromJellyfin called!');
    try {
        console.log('🔍 Getting Jellyfin libraries...');
        // Get available libraries
        const libraries = await getJellyfinLibraries();
        
        console.log('📚 Libraries received:', libraries);
        if (libraries.length === 0) {
            showError('No Jellyfin libraries found');
            return;
        }
        
        // Create library selection dialog
        const libraryNames = libraries.map(lib => lib.name);
        console.log('📝 Library names:', libraryNames);
        const selectedLibrary = await showLibrarySelectionDialog(libraryNames);
        
        if (!selectedLibrary) {
            console.log('❌ User cancelled library selection');
            return; // User cancelled
        }
        
        console.log('✅ User selected library:', selectedLibrary);
        
        // Let user select which lists to import to
        let selectedListIds;
        try {
            selectedListIds = await showListSelectionDialog();
        } catch (error) {
            console.error('❌ Error loading lists for selection:', error);
            // Fallback to personal list if list selection fails
            selectedListIds = ["personal"];
            showWarning('Could not load custom lists. Importing to personal watchlist.');
        }
        
        if (!selectedListIds || selectedListIds.length === 0) {
            console.log('❌ User cancelled list selection');
            return;
        }
        
        console.log('✅ User selected lists:', selectedListIds);
        
        try {
            console.log('🎯 About to show confirmation dialog...');
            const listNames = selectedListIds.map(id => {
                if (id === "personal") {
                    return "My Watchlist";
                }
                const list = userLists.find(l => l.id == id || l.id === String(id));
                return list ? list.name : 'Unknown List';
            }).join(', ');
            
            console.log('✅ User initiated import, proceeding...');
            
            // Pre-scan to get total work count for progress bar
            console.log('🔍 Pre-scanning library for progress tracking...');
            const preScanResponse = await fetch(`${API_BASE}/import/jellyfin/pre-scan/${encodeURIComponent(selectedLibrary)}`, {
                headers: getAuthHeaders()
            });
            
            if (!preScanResponse.ok) {
                const error = await preScanResponse.json();
                showError('Pre-scan failed: ' + (error.error || 'Unknown error'));
                return;
            }
            
            const preScanData = await preScanResponse.json();
            console.log('📊 Pre-scan results:', preScanData);
            
            // Show progress modal with real progress tracking
            const progressModal = showProgressModalWithProgress(
                'Starting Jellyfin import...', 
                `Found ${preScanData.total_movies} movies to process`,
                preScanData.total_work
            );
            
            // Store pre-scan data for progress tracking
            progressModal.preScanData = preScanData;
            
            console.log('📡 About to send POST request to:', `${API_BASE}/import/jellyfin/`);
            console.log('📦 Request body:', { library_name: selectedLibrary, list_ids: selectedListIds });
            console.log('🔑 Auth headers:', getAuthHeaders());
            
            // Update progress to show import starting
            updateProgress(progressModal, 1, preScanData.total_work, 'Starting import...', 'Sending request to server...');
            
            // Start predictive progress animation
            console.log('🚀 Starting predictive progress with total work:', preScanData.total_work);
            startPredictiveProgress(progressModal, preScanData.total_work);
            
            const response = await fetch(`${API_BASE}/import/jellyfin/`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    library_name: selectedLibrary,
                    list_ids: selectedListIds
                })
            });
            
            console.log('📡 Response received:', response);
            console.log('📊 Response status:', response.status);
            console.log('📋 Response headers:', response.headers);
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Import result:', result);
                
                // Update progress to show completion
                updateProgress(progressModal, preScanData.total_work, preScanData.total_work, 'Import complete!', 'Processing results...');
                
                // Check if result is actually an error (FastAPI sometimes returns errors as 200)
                if (Array.isArray(result) && result.length === 2 && result[1] === 500) {
                    const errorObj = result[0];
                    console.error('❌ Backend returned error as 200:', errorObj);
                    showError('Jellyfin import failed: ' + (errorObj.error || 'Internal server error'));
                    return;
                }
                
                if (result.error) {
                    console.error('❌ Import failed with error:', result.error);
                    closeProgressModal(progressModal);
                    showError('Jellyfin import failed: ' + result.error);
                    return;
                }
                
                // Close progress modal and show success
                closeProgressModal(progressModal);
                
                // Build success message with skipped items details
                let successMsg = `Jellyfin import complete! Imported: ${result.imported || 0}, Updated: ${result.updated || 0}, Skipped: ${result.skipped || 0}`;
                
                // Add skipped items details if available
                if (result.skipped_items && result.skipped_items.length > 0) {
                    successMsg += `\n\nSkipped items:`;
                    result.skipped_items.forEach(item => {
                        successMsg += `\n• ${item.title}: ${item.reason}`;
                    });
                }
                
                showSuccess(successMsg);
                
                // Force a direct refresh to show new items immediately
                console.log('🔄 Forcing watchlist refresh after import...');
                await loadWatchlist();
                
                // Also trigger a manual page refresh as backup
                setTimeout(() => {
                    console.log('🔄 Triggering backup page refresh...');
                    window.location.reload();
                }, 2000);
            } else {
                const error = await response.json();
                console.error('❌ Import failed with status:', response.status);
                console.error('❌ Error details:', error);
                closeProgressModal(progressModal);
                showError('Jellyfin import failed: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('💥 Error in import process:', error);
            closeProgressModal(progressModal);
            showError('Jellyfin import failed: ' + error.message);
        }
    } catch (error) {
        console.error('💥 Error in importFromJellyfin:', error);
        showError('Jellyfin import failed: ' + error.message);
    }
}

function showLibrarySelectionDialog(libraryNames) {
    console.log('showLibrarySelectionDialog called with:', libraryNames);
    return new Promise((resolve) => {
        console.log('🏗️ Creating modal...');
        // Create modal overlay using the new modal system
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'flex';
        
        console.log('📱 Modal overlay created:', modalOverlay);
        
        // Create modal content using the new modal structure
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.maxWidth = '500px';
        
        console.log('🎨 Modal content created:', modal);
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3>📚 Select Jellyfin Library</h3>
                <p class="modal-subtitle">Choose which library to import from</p>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 20px;">
                    ${libraryNames.map(name => `
                        <button class="library-option" data-library="${name}" style="
                            display: block;
                            width: 100%;
                            padding: 16px;
                            margin: 8px 0;
                            border: 2px solid rgba(255, 255, 255, 0.2);
                            border-radius: 12px;
                            background: rgba(255, 255, 255, 0.08);
                            color: #e0e0e0;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: 500;
                            transition: all 0.3s ease;
                        ">${name}</button>
                    `).join('')}
                </div>
            </div>
            <div class="modal-buttons">
                <button id="cancelLibraryBtn" class="btn btn-secondary">Cancel</button>
            </div>
        `;
        
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        
        console.log('✅ Modal added to DOM');
        
        // Add event listeners
        const libraryOptions = modal.querySelectorAll('.library-option');
        console.log('🔘 Found library options:', libraryOptions.length);
        
        libraryOptions.forEach(option => {
            option.addEventListener('click', () => {
                const selectedLibrary = option.dataset.library;
                console.log('🎯 Library option clicked:', selectedLibrary);
                // Remove modal with a small delay to ensure proper cleanup
                setTimeout(() => {
                    document.body.removeChild(modalOverlay);
                }, 100);
                resolve(selectedLibrary);
            });
            
            option.addEventListener('mouseenter', () => {
                option.style.borderColor = '#00d4aa';
                option.style.backgroundColor = 'rgba(0, 212, 170, 0.15)';
                option.style.color = '#ffffff';
            });
            
            option.addEventListener('mouseleave', () => {
                option.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                option.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                option.style.color = '#e0e0e0';
            });
        });
        
        const cancelBtn = modal.querySelector('#cancelLibraryBtn');
        cancelBtn.addEventListener('click', () => {
            console.log('❌ Cancel button clicked');
            document.body.removeChild(modalOverlay);
            resolve(null);
        });
        
        // Close on backdrop click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                console.log('🖱️ Backdrop clicked, closing modal');
                document.body.removeChild(modalOverlay);
                resolve(null);
            }
        });
        
        console.log('🎭 Modal setup complete, waiting for user interaction...');
    });
}

// Show list selection dialog for import
function showListSelectionDialog() {
    console.log('🎯 showListSelectionDialog called');
    return new Promise((resolve) => {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'flex';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.maxWidth = '600px';
        
        // Filter lists to show (exclude deleted)
        const availableLists = userLists ? userLists.filter(list => !list.deleted) : [];
        
        // If no lists available, add personal list manually
        if (availableLists.length === 0) {
            availableLists.push({
                id: "personal",
                name: "My Watchlist",
                description: "Your personal watchlist",
                type: "personal",
                color: "#007AFF",
                icon: "📱",
                item_count: 0
            });
        }
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3>🎯 Select Lists for Import</h3>
                <p class="modal-subtitle">Choose which lists to import the movies to</p>
            </div>
            <div class="modal-body">
                <div class="import-lists-selection" style="max-height: 300px; overflow-y: auto;">
                    ${availableLists.map(list => `
                        <label class="list-selection-item" style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            padding: 12px;
                            margin: 8px 0;
                            border: 2px solid rgba(255, 255, 255, 0.2);
                            border-radius: 12px;
                            background: rgba(255, 255, 255, 0.08);
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.borderColor='#00d4aa'; this.style.backgroundColor='rgba(0, 212, 170, 0.1)'" onmouseout="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.backgroundColor='rgba(255, 255, 255, 0.08)'">
                            <input type="checkbox" value="${list.id}" style="
                                width: 18px;
                                height: 18px;
                                accent-color: #00d4aa;
                                margin: 0;
                            " ${list.type === 'personal' ? 'checked' : ''}>
                            <div class="list-info" style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="color: ${list.color || '#007AFF'}; font-size: 1.1em;">${list.icon || '📋'}</span>
                                    <strong style="color: #ffffff;">${list.name}</strong>
                                    ${list.type === 'shared' ? '<span style="color: #00d4aa; font-size: 0.8em;">SHARED</span>' : ''}
                                </div>
                                <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9em;">
                                    ${list.description || (list.type === 'personal' ? 'Your main watchlist' : 'Custom list')}
                                </div>
                                <div style="color: rgba(255, 255, 255, 0.5); font-size: 0.8em;">
                                    ${list.item_count || 0} items
                                </div>
                            </div>
                        </label>
                    `).join('')}
                </div>
                
                <div style="margin-top: 16px; padding: 12px; background: rgba(0, 212, 170, 0.1); border-radius: 8px; border-left: 4px solid #00d4aa;">
                    <p style="color: #00d4aa; font-size: 0.9em; margin: 0;">
                        💡 Tip: You can select multiple lists. Movies will be added to all selected lists.
                    </p>
                </div>
            </div>
            <div class="modal-buttons">
                <button id="selectAllListsBtn" class="btn btn-secondary">Select All</button>
                <button id="cancelListBtn" class="btn btn-secondary">Cancel</button>
                <button id="confirmListBtn" class="btn btn-primary">Import to Selected Lists</button>
            </div>
        `;
        
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        
        // Handle select all button
        const selectAllBtn = modal.querySelector('#selectAllListsBtn');
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !allChecked);
            selectAllBtn.textContent = allChecked ? 'Select All' : 'Unselect All';
        });
        
        // Handle confirm button
        const confirmBtn = modal.querySelector('#confirmListBtn');
        confirmBtn.addEventListener('click', () => {
            const selectedCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
            const selectedIds = Array.from(selectedCheckboxes).map(cb => {
                const value = cb.value;
                // Don't parse "personal" as integer, keep as string
                if (value === "personal") {
                    return value;
                }
                const parsed = parseInt(value);
                return isNaN(parsed) ? value : parsed; // Keep as string if NaN
            });
            
            if (selectedIds.length === 0) {
                alert('Please select at least one list to import to.');
                return;
            }
            
            console.log('✅ User selected lists:', selectedIds);
            document.body.removeChild(modalOverlay);
            resolve(selectedIds);
        });
        
        // Handle cancel button
        const cancelBtn = modal.querySelector('#cancelListBtn');
        cancelBtn.addEventListener('click', () => {
            console.log('❌ User cancelled list selection');
            document.body.removeChild(modalOverlay);
            resolve(null);
        });
        
        // Close on backdrop click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                console.log('🖱️ Backdrop clicked, cancelling list selection');
                document.body.removeChild(modalOverlay);
                resolve(null);
            }
        });
        
        console.log('🎯 List selection modal setup complete');
    });
}

function showError(message) {
    // Create or update error message
    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error error-message';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '20px';
        errorDiv.style.right = '20px';
        errorDiv.style.zIndex = '10000';
        errorDiv.style.maxWidth = '300px';
        document.body.appendChild(errorDiv);
    }
    
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    // Create or update success message
    let successDiv = document.querySelector('.success-message');
    if (!successDiv) {
        successDiv = document.createElement('div');
        successDiv.className = 'success success-message';
        successDiv.style.position = 'fixed';
        successDiv.style.top = '20px';
        successDiv.style.right = '20px';
        successDiv.style.zIndex = '10000';
        successDiv.style.maxWidth = '300px';
        document.body.appendChild(successDiv);
    }
    
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    
    // Auto-hide after 6 seconds (2x longer for better readability)
    setTimeout(() => {
        successDiv.style.display = 'none';
    }, 6000);
}

function showWarning(message) {
    // Create or update warning message
    let warningDiv = document.querySelector('.warning-message');
    if (!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.className = 'warning warning-message';
        warningDiv.style.position = 'fixed';
        warningDiv.style.top = '20px';
        warningDiv.style.right = '20px';
        warningDiv.style.zIndex = '10000';
        warningDiv.style.maxWidth = '300px';
        warningDiv.style.backgroundColor = '#fff3cd';
        warningDiv.style.color = '#856404';
        warningDiv.style.border = '1px solid #ffeaa7';
        warningDiv.style.borderRadius = '4px';
        warningDiv.style.padding = '10px';
        warningDiv.style.fontSize = '14px';
        document.body.appendChild(warningDiv);
    }
    
    warningDiv.textContent = message;
    warningDiv.style.display = 'block';
    
    // Auto-hide after 10 seconds for warnings
    setTimeout(() => {
        warningDiv.style.display = 'none';
    }, 10000);
}

// --- Import Type Dropdown Logic ---




async function handleImportTypeSubmit() {
    const input = document.getElementById('importTypeInput');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    
    // Smart omnibox handles both local and external search automatically
    // No need to check mode - the input handler will manage this
    
    console.log(`[DEBUG] Auto-detect search called with value: ${value}`);
    
    // First check if it's a URL
    if (isUrl(value)) {
        console.log('[DEBUG] Detected as URL, importing by URL');
        await importByUrlUnified(value);
        return;
    }
    
    // If not a URL, search both movies and series
    console.log('[DEBUG] Detected as search query, searching both movies and series');
    await searchAllUnified(value);
}

function isUrl(str) {
    try {
        // Check if it's a valid URL
        new URL(str);
        return true;
    } catch {
        // Check if it starts with common URL patterns
        const urlPatterns = [
            /^https?:\/\//,
            /^www\./,
            /^imdb\.com\//,
            /^tvmaze\.com\//,
            /^themoviedb\.org\//
        ];
        return urlPatterns.some(pattern => pattern.test(str));
    }
}

async function searchAllUnified(query) {
    document.getElementById('searchResultsMovies').innerHTML = '';
    document.getElementById('searchResultsSeries').innerHTML = '';
    
    try {
        console.log(`[DEBUG] Making request to: ${API_BASE}/search/all/?query=${encodeURIComponent(query)}`);
        const response = await fetch(`${API_BASE}/search/all/?query=${encodeURIComponent(query)}`, {
            headers: getAuthHeaders()
        });
        
        console.log(`[DEBUG] Response status: ${response.status}`);
        console.log(`[DEBUG] Response headers:`, response.headers);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let results = await response.json();
        console.log('[DEBUG] Unified search results:', results);
        
        // Display all results mixed together (already sorted by relevance from backend)
        displayUnifiedSearchResults(results);
        
        // Clear search input after successful search
        document.getElementById('importTypeInput').value = '';
        
    } catch (e) {
        console.error('Unified search failed:', e);
        showError('Search failed: ' + (e.message || e));
    }
}

async function importByUrlUnified(url) {
    try {
        const response = await fetch(`${API_BASE}/import/url`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url })
        });
        if (response.ok) {
            showSuccess('Item imported successfully!');
            document.getElementById('importTypeInput').value = '';
            // Clear search results and show watchlist
            document.getElementById('searchResultsMovies').innerHTML = '';
            document.getElementById('searchResultsSeries').innerHTML = '';
            // Clear smart omnibox search results
            clearSmartOmniboxSearch();
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOMContentLoaded event fired');
    
    // Check authentication on page load
    const authResult = await checkAuth();
    if (!authResult) {
        console.log('Authentication failed, redirecting to login');
        return;
    }
    
    // Check admin status after successful authentication
    await checkAdminStatus();
    
    console.log('Setting up event listeners...');
    
    // Add event listeners
    // Note: importTypeSubmitBtn is handled by smart omnibox system
    document.getElementById('settingsBtn').addEventListener('click', toggleSettingsMenu);
    
    // Enter key is handled by smart omnibox system
    const importTypeInput = document.getElementById('importTypeInput');
    if (importTypeInput) {
        // Clear search input on page load
        importTypeInput.value = '';
    }
    
    // Close settings menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.settings-menu')) {
            document.getElementById('settingsDropdown').style.display = 'none';
        }
    });
    
    // Handle settings menu item clicks using event delegation
    document.addEventListener('click', function(e) {
        const settingsItem = e.target.closest('.settings-item');
        if (settingsItem) {
            const action = settingsItem.getAttribute('data-action');
            if (action) {
                console.log('🎯 Settings item clicked:', action);
                switch (action) {
                    case 'showSortOptions':
                        console.log('📊 Calling showSortOptions...');
                        showSortOptions();
                        break;
                    case 'showFilterOptions':
                        console.log('🔍 Calling showFilterOptions...');
                        showFilterOptions();
                        break;
                    case 'importFromJellyfin':
                        console.log('📥 Calling importFromJellyfin...');
                        importFromJellyfin();
                        break;
                    case 'toggleListManagement':
                        console.log('📋 Calling toggleListManagement...');
                        toggleListManagement();
                        break;
                    case 'showListManagementOverlay':
                        console.log('⚙️ Calling showListManagementOverlay...');
                        showListManagementOverlay();
                        break;
                    case 'account':
                        openAccountModal();
                        break;
                    case 'logout':
                        console.log('🚪 Calling logout...');
                        logout();
                        break;
                }
                // Close the dropdown after clicking
                document.getElementById('settingsDropdown').style.display = 'none';
            }
        }
    });
    
    // Set up episode checkbox event listeners using event delegation
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('episode-checkbox')) {
            const seriesId = e.target.getAttribute('data-series-id');
            const season = e.target.getAttribute('data-season');
            const episode = e.target.getAttribute('data-episode');
            console.log('Episode checkbox clicked:', { seriesId, season, episode });
            toggleEpisodeWatched(seriesId, parseInt(season), parseInt(episode));
        }
    });
    
    // Set up general checkbox event listeners using event delegation
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('checkbox') && !e.target.classList.contains('episode-checkbox')) {
            e.preventDefault();
            e.stopPropagation();
            
            const type = e.target.getAttribute('data-type');
            const id = e.target.getAttribute('data-id');
            
            if (type && id) {
                console.log('Checkbox clicked:', { type, id });
                
                // Handle season checkboxes specially
                if (type === 'season') {
                    const seriesId = e.target.getAttribute('data-series-id');
                    const seasonNumber = e.target.getAttribute('data-season');
                    console.log('Season checkbox clicked:', { seriesId, seasonNumber });
                    toggleSeasonWatched(seriesId, seasonNumber);
                } else {
                    toggleWatched(type, id);
                }
            }
        }
    });
    
    // Load saved filter state or set defaults
    loadFilterState();
    // Only set defaults if no saved state exists
    if (!localStorage.getItem('watchlistFilters')) {
        setDefaultFilterState();
    }
    
    // Ensure watchlistState is properly initialized
    ensureWatchlistStateInitialized();
    
    loadWatchlist();
    
    // Update sort button text to show current sort option
    updateSortButtonText();
    
    // Update filter button text to show current filter state
    updateFilterButtonText();
    
    // Initialize notification system
    checkForNewReleases();
    
    // Check for new releases every 30 minutes
    setInterval(checkForNewReleases, 30 * 60 * 1000);
    
    // Check token expiration on page load
    checkTokenExpiration();
    
    // Check token expiration every hour
    setInterval(checkTokenExpiration, 60 * 60 * 1000);
    
    // Initialize smart omnibox
    initializeSmartOmnibox();
    
    // Initialize online status
    updateOnlineStatus();
});

// Function to set default filter state
function setDefaultFilterState() {
    // Set default filters to show all items
    watchlistFilters = { 
        movies: true, 
        series: true, 
        unwatched: true,
        runtime_under_30: true,
        runtime_30_60: true,
        runtime_60_90: true,
        runtime_over_90: true
    };
    
    // Set default sort option if none exists
    if (!watchlistState.sortBy) {
        watchlistState.sortBy = 'alphabetical';
    }
    
    // Note: UI checkboxes are now handled by the new iOS-like filter menu
    // No need to update individual checkbox elements
    
    updateFilterState();
    
    // Update filter button text to reflect new state
    updateFilterButtonText();
}

// Add CSS for .dropdown-item if not present
if (!document.getElementById('customDropdownStyle')) {
    const style = document.createElement('style');
    style.id = 'customDropdownStyle';
    style.textContent = `.dropdown-item { padding: 8px 12px; cursor: pointer; border-radius: 6px; transition: background 0.2s; }
    .dropdown-item.selected { background: #00d4aa; color: white; }
    .dropdown-item:hover { background: #e8f8f5; }`;
    document.head.appendChild(style);
} 

// Settings menu functionality
let settingsMenuToggleTimeout = null;
function toggleSettingsMenu() {
    // Prevent rapid clicking
    if (settingsMenuToggleTimeout) {
        clearTimeout(settingsMenuToggleTimeout);
    }
    
    settingsMenuToggleTimeout = setTimeout(() => {
        const dropdown = document.getElementById('settingsDropdown');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }, 50); // Small delay to prevent double-clicks
}

function showSortOptions() {
    // Toggle the sort row visibility
    const existingRow = document.getElementById('sortOptionsRow');
    if (existingRow) {
        existingRow.remove();
        // Update button text
        updateSortButtonText();
        return;
    }

    // Create iOS-style sort row
    const sortRow = document.createElement('div');
    sortRow.id = 'sortOptionsRow';
    sortRow.style.cssText = `
        background: #1a0a1a;
        padding: 16px;
        border-bottom: 1px solid #444;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // Title with close button
    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Sort Options';
    title.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: #00d4aa;
    `;
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        cursor: pointer;
        color: #666;
        font-size: 16px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
    `;
    closeBtn.onmouseenter = () => {
        closeBtn.style.background = '#444';
        closeBtn.style.color = '#ccc';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#666';
    };
    closeBtn.onclick = () => {
        sortRow.remove();
        updateSortButtonText();
    };
    
    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);
    sortRow.appendChild(titleContainer);
    
    // Sort chips container
    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    `;
    
    // Define sort options matching iOS
    const sortOptions = [
        { key: 'alphabetical', label: 'Title', icon: '🔤' },
        { key: 'added', label: 'Date Added', icon: '➕' },
        { key: 'release_date', label: 'Date Released', icon: '📅' }
    ];
    
    // Get current sort option
    const currentSort = watchlistState.sortBy || 'alphabetical';
    let currentDirection = 'asc';
    
    // Determine current direction
    if (currentSort === 'alphabetical_reverse') {
        currentDirection = 'desc';
    } else if (currentSort === 'added_newest') {
        currentDirection = 'desc';
    } else if (currentSort === 'release_date_newest') {
        currentDirection = 'desc';
    }
    
    // Create sort chips
    sortOptions.forEach(option => {
        const chip = document.createElement('div');
        chip.style.cssText = `
            background: #444;
            border-radius: 16px;
            padding: 8px 12px;
            border: 1px solid #666;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #ccc;
            font-weight: 500;
        `;
        
        // Determine if this chip is active
        let isActive = false;
        if (option.key === 'alphabetical' && (currentSort === 'alphabetical' || currentSort === 'alphabetical_reverse')) {
            isActive = true;
        } else if (option.key === 'added' && (currentSort === 'added' || currentSort === 'added_newest')) {
            isActive = true;
        } else if (option.key === 'release_date' && (currentSort === 'release_date' || currentSort === 'release_date_newest')) {
            isActive = true;
        }
        
        if (isActive) {
            chip.style.background = '#00d4aa';
            chip.style.borderColor = '#00d4aa';
            chip.style.color = '#000';
            chip.style.fontWeight = '600';
        }
        
        // Add direction arrow if active
        let directionArrow = '';
        if (isActive) {
            if (option.key === 'alphabetical') {
                directionArrow = currentSort === 'alphabetical' ? ' ↓' : ' ↑';
            } else if (option.key === 'added') {
                directionArrow = currentSort === 'added' ? ' ↓' : ' ↑';
            } else if (option.key === 'release_date') {
                directionArrow = currentSort === 'release_date' ? ' ↓' : ' ↑';
            }
        }
        
        chip.innerHTML = `
            <span>${option.icon}</span>
            <span>${option.label}${directionArrow}</span>
        `;
        
        chip.onclick = () => {
            // Toggle direction or set to ascending if not active
            let newSortKey = option.key;
            if (isActive) {
                // Toggle direction
                if (option.key === 'alphabetical') {
                    newSortKey = currentSort === 'alphabetical' ? 'alphabetical_reverse' : 'alphabetical';
                } else if (option.key === 'added') {
                    newSortKey = currentSort === 'added' ? 'added_newest' : 'added';
                } else if (option.key === 'release_date') {
                    newSortKey = currentSort === 'release_date' ? 'release_date_newest' : 'release_date';
                }
            }
            
            setSortOption(newSortKey);
            
            // Update the row with new state
            setTimeout(() => {
                showSortOptions(); // This will recreate the row with updated state
            }, 100);
        };
        
        chip.onmouseenter = () => {
            if (!isActive) {
                chip.style.background = '#555';
                chip.style.borderColor = '#00d4aa';
            }
        };
        
        chip.onmouseleave = () => {
            if (!isActive) {
                chip.style.background = '#444';
                chip.style.borderColor = '#666';
            }
        };
        
        chipsContainer.appendChild(chip);
    });
    
    sortRow.appendChild(chipsContainer);
    
    // Insert the row after the search container
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer && searchContainer.nextSibling) {
        searchContainer.parentNode.insertBefore(sortRow, searchContainer.nextSibling);
    } else if (searchContainer) {
        searchContainer.parentNode.appendChild(sortRow);
    }
    
    // Update button text
    updateSortButtonText();
}













    

    


function showFilterOptions() {
    // Toggle the filter row visibility
    const existingRow = document.getElementById('filterOptionsRow');
    if (existingRow) {
        existingRow.remove();
        // Update button text
        updateFilterButtonText();
        return;
    }

    // Create iOS-style filter row
    const filterRow = document.createElement('div');
    filterRow.id = 'filterOptionsRow';
    filterRow.style.cssText = `
        background: #1a0a1a;
        padding: 16px;
        border-bottom: 1px solid #444;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // Title with close button
    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Filter Options';
    title.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: #00d4aa;
    `;
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        cursor: pointer;
        color: #666;
        font-size: 16px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
    `;
    closeBtn.onmouseenter = () => {
        closeBtn.style.background = '#444';
        closeBtn.style.color = '#ccc';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#666';
    };
    closeBtn.onclick = () => {
        filterRow.remove();
        updateFilterButtonText();
    };
    
    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);
    filterRow.appendChild(titleContainer);
    
    // Filter chips container
    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    `;
    
    // Get current filter state
    const currentFilters = { ...watchlistFilters };
    
    // Create filter chips
    filterOptions.forEach(option => {
        const chip = document.createElement('div');
        chip.style.cssText = `
            background: #444;
            border-radius: 16px;
            padding: 8px 12px;
            border: 1px solid #666;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #ccc;
            font-weight: 500;
        `;
        
        if (currentFilters[option.key]) {
            chip.style.background = '#00d4aa';
            chip.style.borderColor = '#00d4aa';
            chip.style.color = '#000';
            chip.style.fontWeight = '600';
        }
        
        chip.innerHTML = `
            <span>${option.icon}</span>
            <span>${option.label}</span>
        `;
        
        chip.onclick = () => {
            // Toggle the filter
            currentFilters[option.key] = !currentFilters[option.key];
            
            // Update the global filter state
            watchlistFilters[option.key] = currentFilters[option.key];
            
            // Update the visual state of this specific chip immediately
            if (currentFilters[option.key]) {
                chip.style.background = '#00d4aa';
                chip.style.borderColor = '#00d4aa';
                chip.style.color = '#000';
                chip.style.fontWeight = '600';
            } else {
                chip.style.background = '#444';
                chip.style.borderColor = '#666';
                chip.style.color = '#ccc';
                chip.style.fontWeight = '500';
            }
            
            // Update filter state and reload watchlist
            updateFilterState();
            loadWatchlist();
            
            // Update the filter button text
            updateFilterButtonText();
        };
        
        chip.onmouseenter = () => {
            if (!currentFilters[option.key]) {
                chip.style.background = '#555';
                chip.style.borderColor = '#00d4aa';
            }
        };
        
        chip.onmouseleave = () => {
            if (!currentFilters[option.key]) {
                chip.style.background = '#444';
                chip.style.borderColor = '#666';
            }
        };
        
        chipsContainer.appendChild(chip);
    });
    
    filterRow.appendChild(chipsContainer);
    
    // Insert the row after the search container
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer && searchContainer.nextSibling) {
        searchContainer.parentNode.insertBefore(filterRow, searchContainer.nextSibling);
    } else if (searchContainer) {
        searchContainer.parentNode.appendChild(filterRow);
    }
    
    // Update button text
    updateFilterButtonText();
}

function updateFilterChipsVisualState(filterRow, currentFilters) {
    // Update all filter chips to reflect the new state
    const chips = filterRow.querySelectorAll('[onclick*="currentFilters[option.key]"]');
    
    chips.forEach((chip, index) => {
        const filterKey = Object.keys(currentFilters)[index];
        const isActive = currentFilters[filterKey];
        
        // Update border and background for iOS-style chips
        chip.style.borderColor = isActive ? '#00d4aa' : '#666';
        chip.style.background = isActive ? '#00d4aa' : '#444';
        chip.style.color = isActive ? '#000' : '#ccc';
        chip.style.fontWeight = isActive ? '600' : '500';
    });
}

function updateFilterButtonText() {
    const filterButton = document.querySelector('.settings-item[onclick="showFilterOptions()"]');
    if (!filterButton) return;
    
    const activeFilters = Object.entries(watchlistFilters)
        .filter(([key, value]) => value)
        .map(([key]) => {
            switch(key) {
                case 'movies': return 'Movies';
                case 'series': return 'TV Shows';
                case 'unwatched': return 'Unwatched';
                case 'runtime_under_30': return '<30min';
                case 'runtime_30_60': return '30-60min';
                case 'runtime_60_90': return '60-90min';
                case 'runtime_over_90': return '>90min';
                default: return key;
            }
        })
        .filter(Boolean);
    
    if (activeFilters.length === 0) {
        filterButton.innerHTML = '<span>🔍</span> Filter';
    } else if (activeFilters.length === 1) {
        filterButton.innerHTML = `<span>🔍</span> Filter (${activeFilters[0]})`;
    } else if (activeFilters.length === 2) {
        filterButton.innerHTML = `<span>🔍</span> Filter (${activeFilters[0]}, ${activeFilters[1]})`;
    } else {
        filterButton.innerHTML = `<span>🔍</span> Filter (${activeFilters.length} active)`;
    }
}

function showStats() {
    // Create modal for statistics
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    modalContent.innerHTML = `
        <h3 style="margin: 0 0 20px 0; color: #333;">📊 Statistics</h3>
        <div id="modalStatsContent">
            <div class="loading">Loading statistics...</div>
        </div>
        <button class="btn btn-secondary" onclick="closeModal();" style="margin-top: 20px; width: 100%;">Close</button>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Load stats into modal
    loadStatsForModal();
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
}

async function loadStatsForModal() {
    const modalStatsContent = document.getElementById('modalStatsContent');
    if (!modalStatsContent) return;
    
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            renderStatsForModal(data, modalStatsContent);
        } else {
            modalStatsContent.innerHTML = '<div class="error">Failed to load statistics</div>';
        }
    } catch (e) {
        modalStatsContent.innerHTML = '<div class="error">Failed to load statistics: ' + (e.message || e) + '</div>';
    }
}

function renderStatsForModal(data, container) {
    let html = '<div class="stats">';
    
    // Total items
    const totalItems = (data.total_movies || 0) + (data.total_series || 0);
    html += `<div class="stat-card">
        <h3>${totalItems}</h3>
        <p>Total Items</p>
    </div>`;
    
    // Movies
    html += `<div class="stat-card">
        <h3>${data.total_movies || 0}</h3>
        <p>Movies</p>
    </div>`;
    
    // Series
    html += `<div class="stat-card">
        <h3>${data.total_series || 0}</h3>
        <p>TV Series</p>
    </div>`;
    
    // Watched items
    const watchedItems = (data.watched_movies || 0) + (data.watched_series || 0);
    html += `<div class="stat-card">
        <h3>${watchedItems}</h3>
        <p>Watched</p>
    </div>`;
    
    // Unwatched items
    const unwatchedItems = totalItems - watchedItems;
    html += `<div class="stat-card">
        <h3>${unwatchedItems}</h3>
        <p>Unwatched</p>
    </div>`;
    
    // Completion percentage
    const completionPercentage = totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0;
    html += `<div class="stat-card">
        <h3>${completionPercentage}%</h3>
        <p>Completion</p>
    </div>`;
    
    html += '</div>';
    container.innerHTML = html;
}

function closeModal() {
    const modals = document.querySelectorAll('div[style*="position: fixed"]');
    modals.forEach(modal => modal.remove());
    
    // Close settings dropdown
    const settingsDropdown = document.getElementById('settingsDropdown');
    if (settingsDropdown) {
        settingsDropdown.style.display = 'none';
    }
}

async function showDetails(type, id, itemData) {
    // Debug logging to see what data we're getting
    console.log('🔍 showDetails called with:', { type, id, itemData });
    console.log('🔍 itemData overview field:', itemData?.overview);
    console.log('🔍 itemData keys:', itemData ? Object.keys(itemData) : 'null');
    
    // Clear newly imported status when details are viewed
    clearNewlyImportedStatus(type, id);
    
    // Special handling for collections - show dedicated collection page
    if (type === 'collection' && itemData) {
        showCollectionDetails(itemData);
        return;
    }
    
    // Special handling for seasons - show season details
    if (type === 'season' && itemData) {
        console.log('🎬 Opening season details for:', itemData);
        try {
            showSeasonDetails(itemData);
        } catch (error) {
            console.error('❌ Error opening season details:', error);
            showError('Failed to open season details');
        }
        return;
    }
    
    // Episodes now use the same modal UI as movies and series
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        padding: 24px;
        max-width: 800px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        border: 2px solid #00d4aa;
        box-shadow: 0 8px 48px 0 rgba(83, 52, 131, 0.4);
    `;
    
    // Build content based on item type and data
    let content = '';
    let notesSection = '';
    
    if (itemData) {
        // Handle different data structures for movies/series vs episodes
        let poster, title, overview, releaseDate, runtime, quality, watched, notes;
        
        if (type === 'episode') {
            // Episode data structure
            poster = itemData.still_path ? `https://image.tmdb.org/t/p/w500${itemData.still_path}` : '/static/no-image.png';
            title = itemData.title || 'Unknown Episode';
            overview = itemData.overview || 'No description available for this episode.';
            releaseDate = itemData.air_date ? new Date(itemData.air_date).getFullYear() : '';
            runtime = itemData.runtime ? `${itemData.runtime} min` : '';
            quality = ''; // Episodes don't have quality info
            watched = itemData.watched || false;
            notes = itemData.notes || '';
        } else {
            // Movie/series data structure
            poster = itemData.poster_url || '/static/no-image.png';
            title = itemData.title || 'Unknown Title';
            overview = itemData.overview || 'No description available.';
            releaseDate = itemData.release_date ? new Date(itemData.release_date).getFullYear() : '';
            runtime = itemData.runtime ? `${itemData.runtime} min` : '';
            quality = itemData.quality ? `(${itemData.quality})` : '';
            watched = itemData.watched || false;
            notes = itemData.notes || '';
        }
        
        // Watched status indicator
        let watchedStatus = '';
        if (type === 'series' && itemData.episodes) {
            const totalEpisodes = itemData.episodes.length;
            const watchedEpisodes = itemData.episodes.filter(ep => ep.watched).length;
            const unwatchedEpisodes = totalEpisodes - watchedEpisodes;
            
            if (watchedEpisodes === 0) {
                watchedStatus = '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
            } else if (watchedEpisodes === totalEpisodes) {
                watchedStatus = '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>';
            } else {
                watchedStatus = `<span style="color: #ffa500; font-weight: bold;">◐ Partially Watched</span> (${watchedEpisodes}/${totalEpisodes})`;
            }
        } else {
            // For individual movies and episodes, use simple watched/not watched
            watchedStatus = watched ? 
                '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>' : 
                '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
        }
        
        content = `
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                <div style="position: relative;">
                    <img src="${poster}" alt="Poster" style="width: 120px; height: 180px; object-fit: cover; border-radius: 8px;" onerror="this.src='/static/no-image.png';">
                    <input type="checkbox" ${watched ? 'checked' : ''} onchange="${type === 'episode' ? `toggleEpisodeWatchedInDetails(${itemData.seriesId}, ${itemData.seasonNumber}, ${itemData.episodeNumber}, this.checked)` : `toggleWatchedInDetails('${type}', ${id}, this.checked)`}" style="position: absolute; bottom: 4px; left: 4px; transform: scale(1.2);">
                </div>
                <div style="flex: 1;">
                    <h2 style="color: #ffffff; margin: 0 0 8px 0; font-size: 1.5em;">${title}</h2>
                    <p style="color: #cccccc; margin: 0 0 8px 0;">
                        ${type === 'movie' ? 'Movie' : type === 'episode' ? 'TV Episode' : 'TV Series'}
                        ${type === 'episode' && itemData.seriesTitle ? ` • ${itemData.seriesTitle}` : ''}
                        ${type === 'episode' && itemData.seasonNumber && itemData.episodeNumber ? ` • Season ${itemData.seasonNumber}, Episode ${itemData.episodeNumber}` : ''}
                        ${releaseDate ? ` • ${releaseDate}` : ''}
                        ${runtime ? ` • ${runtime}` : ''}
                        ${quality ? ` • ${quality}` : ''}
                    </p>
                    <p style="color: #cccccc; margin: 0 0 12px 0;">${watchedStatus}</p>
                    <div style="color: #e0e6ff; line-height: 1.5;">${overview}</div>
                </div>
            </div>
        `;
        
        // Notes section (not available for episodes)
        if (type !== 'episode') {
            notesSection = `
                <div style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <h3 style="color: #ffffff; margin: 0 0 12px 0;">Notes</h3>
                    <textarea id="notes-textarea" placeholder="Add your notes here..." style="width: 100%; min-height: 80px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 12px; color: #ffffff; font-family: inherit; resize: vertical;">${notes}</textarea>
                    <div style="margin-top: 12px; display: flex; gap: 8px;">
                        <button onclick="saveNotes('${type}', ${id})" style="background: #00d4aa; color: #000000; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">Save Notes</button>
                    </div>
                </div>
            `;
        }
        
        // Add additional details for series
        if (type === 'series' && itemData.episodes) {
            const episodeCount = itemData.episodes.length;
            const unwatchedCount = itemData.episodes.filter(ep => !ep.watched).length;
            content += `
                <div style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <h3 style="color: #ffffff; margin: 0 0 12px 0;">Episodes</h3>
                    <p style="color: #cccccc; margin: 0;">${episodeCount} episodes • ${unwatchedCount} unwatched</p>
                    <div style="margin-top: 12px;">
                        ${itemData.episodes.map(ep => `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                                <input type="checkbox" ${ep.watched ? 'checked' : ''} onchange="toggleEpisodeWatchedInDetails(${itemData.id}, ${ep.season_number}, ${ep.episode_number}, this.checked)">
                                <span style="color: ${ep.watched ? '#666666' : '#ffffff'}; text-decoration: ${ep.watched ? 'line-through' : 'none'};">${ep.code} - ${ep.title}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    } else {
        content = `
            <div style="text-align: center; color: #cccccc;">
                <h2 style="color: #ffffff; margin-bottom: 16px;">Details</h2>
                <p>Unable to load details for this item.</p>
            </div>
        `;
    }
    
    modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 1.8em;">Details</h1>
            <button onclick="closeModal()" style="background: none; border: none; color: #cccccc; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
        ${content}
        ${notesSection}
        <div style="margin-top: 24px; text-align: center;">
            <button onclick="closeModal()" style="background: #00d4aa; color: #000000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 600;">Close</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Show dedicated collection details page
 * This provides a better UX for viewing and interacting with movies in collections
 */
function showCollectionDetails(collection) {
    // Clear newly imported status for all movies in the collection
    // This ensures that when collection details are viewed, all movies lose their NEW badges
    if (collection.items && Array.isArray(collection.items)) {
        collection.items.forEach(movie => {
            clearNewlyImportedStatus('movie', movie.id);
        });
    }
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        padding: 24px;
        max-width: 1000px;
        width: 95%;
        max-height: 90vh;
        overflow-y: auto;
        border: 2px solid #00d4aa;
        box-shadow: 0 8px 48px 0 rgba(83, 52, 131, 0.4);
    `;
    
    // Calculate collection stats
    const totalMovies = collection.items.length;
    const watchedMovies = collection.items.filter(m => m.watched).length;
    const unwatchedMovies = totalMovies - watchedMovies;
    
    // Determine collection watched status
    let collectionStatus = '';
    if (watchedMovies === 0) {
        collectionStatus = '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
    } else if (watchedMovies === totalMovies) {
        collectionStatus = '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>';
    } else {
        collectionStatus = `<span style="color: #ffa500; font-weight: bold;">◐ Partially Watched</span> (${watchedMovies}/${totalMovies})`;
    }
    
    // Build collection header
    const header = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 1.8em;">Collection Details</h1>
            <button onclick="closeModal()" style="background: none; border: none; color: #cccccc; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
            <button onclick="toggleCollectionWatched('${collection.id}')" style="background: #00d4aa; color: #000000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                ${watchedMovies === totalMovies ? 'Mark All Unwatched' : 'Mark All Watched'}
            </button>
            <button onclick="removeCollection('${collection.id}')" style="background: #ff6b6b; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                Remove Collection
            </button>
        </div>
    `;
    
    // Build collection info
    const collectionInfo = `
        <div style="display: flex; gap: 20px; margin-bottom: 20px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px;">
            <div style="position: relative;">
                <img src="${collection.poster_url || '/static/no-image.png'}" alt="Collection Poster" style="width: 120px; height: 180px; object-fit: cover; border-radius: 8px;" onerror="this.src='/static/no-image.png';">
                <input type="checkbox" ${watchedMovies === totalMovies ? 'checked' : ''} onchange="toggleCollectionWatched('${collection.id}')" style="position: absolute; bottom: 4px; left: 4px; transform: scale(1.2);">
            </div>
            <div style="flex: 1;">
                <h2 style="color: #ffffff; margin: 0 0 8px 0; font-size: 1.5em;">${collection.title}</h2>
                <p style="color: #cccccc; margin: 0 0 8px 0;">
                    Collection • ${totalMovies} movies • ${unwatchedMovies} unwatched
                </p>
                <p style="color: #cccccc; margin: 0 0 12px 0;">${collectionStatus}</p>
                <div style="color: #e0e6ff; line-height: 1.5;">
                    ${collection.overview || 'No description available.'}
                </div>
            </div>
        </div>
    `;
    
    // Build movies grid
    const moviesGrid = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 1.4em;">Movies in Collection</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                ${collection.items.map(movie => {
                    const isNew = isItemNew('movie', movie.id);
                    const newBadge = isNew ? '<span style="background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px;">NEW</span>' : '';
                    const isNewlyImported = isItemNewlyImported('movie', movie.id);
                    const newlyImportedBadge = isNewlyImported ? '<span style="background: linear-gradient(135deg, #6a4c93 0%, #5a4b8a 100%); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px; border: 1px solid rgba(255,255,255,0.2);">NEW</span>' : '';
                    
                    // Quality badge for Jellyfin movies
                    let qualityBadge = '';
                    if (movie.quality) {
                        const qualityConfig = {
                            'SD': { label: 'SD', bgColor: '#6c757d', textColor: '#ffffff' },
                            'HD': { label: 'HD', bgColor: '#FFD700', textColor: '#000000' },
                            '4K': { label: '4K', bgColor: '#C0C0C0', textColor: '#000000' }
                        };
                        
                        const config = qualityConfig[movie.quality] || qualityConfig['SD'];
                        qualityBadge = `
                            <span style="background: ${config.bgColor}; color: ${config.textColor}; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px;">
                                ${config.label}
                            </span>`;
                    }
                    
                    return `
                        <div class="movie-card" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; cursor: pointer; transition: background-color 0.2s;" 
                             onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" 
                             onmouseout="this.style.backgroundColor='rgba(255,255,255,0.05)'"
                             onclick="showMovieDetails(${movie.id}, '${JSON.stringify(movie).replace(/"/g, '&quot;')}')">
                            <div style="display: flex; gap: 10px;">
                                <div style="position: relative;">
                                    <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" style="width: 50px; height: 75px; object-fit: cover; border-radius: 4px;" onerror="this.src='/static/no-image.png';">
                                    <input type="checkbox" ${movie.watched ? 'checked' : ''} 
                                           onclick="event.stopPropagation(); toggleMovieInCollection(${movie.id}, this.checked)" 
                                           style="position: absolute; bottom: 2px; left: 2px; transform: scale(0.8);">
                                </div>
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                        <h4 style="color: ${movie.watched ? '#666666' : '#ffffff'}; margin: 0; font-size: 1em; text-decoration: ${movie.watched ? 'line-through' : 'none'};">
                                            ${movie.title}${newBadge}${newlyImportedBadge}${qualityBadge}
                                        </h4>
                                    </div>
                                    <p style="color: #cccccc; margin: 0; font-size: 0.8em;">
                                        ${movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                                        ${movie.runtime ? ` • ${movie.runtime} min` : ''}
                                    </p>
                                    <p style="color: ${movie.watched ? '#00d4aa' : '#ff6b6b'}; margin: 4px 0 0 0; font-size: 0.8em; font-weight: 600;">
                                        ${movie.watched ? '✓ Watched' : '○ Not Watched'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Build notes section
    const notesSection = `
        <div style="padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            <h3 style="color: #ffffff; margin: 0 0 12px 0; font-size: 1.2em;">Collection Notes</h3>
            <textarea id="collection-notes-textarea" placeholder="Add notes about this collection..." style="width: 100%; min-height: 80px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 12px; color: #ffffff; font-family: inherit; resize: vertical;">${collection.notes || ''}</textarea>
            <div style="margin-top: 12px;">
                <button onclick="saveCollectionNotes('${collection.id}')" style="background: #00d4aa; color: #000000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Notes</button>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = header + collectionInfo + moviesGrid + notesSection;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}


/**
 * Show season details page
 */
function showSeasonDetails(seasonData) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        padding: 24px;
        max-width: 800px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        border: 2px solid #00d4aa;
        box-shadow: 0 8px 48px 0 rgba(83, 52, 131, 0.4);
    `;
    
    // Calculate season stats
    const totalEpisodes = seasonData.episodes.length;
    const watchedEpisodes = seasonData.episodes.filter(ep => ep.watched).length;
    const unwatchedEpisodes = totalEpisodes - watchedEpisodes;
    
    // Determine season watched status
    let seasonStatus = '';
    if (watchedEpisodes === 0) {
        seasonStatus = '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
    } else if (watchedEpisodes === totalEpisodes) {
        seasonStatus = '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>';
    } else {
        seasonStatus = `<span style="color: #ffa500; font-weight: bold;">◐ Partially Watched</span> (${watchedEpisodes}/${totalEpisodes})`;
    }
    
    // Build season header
    const header = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 1.8em;">Season Details</h1>
            <button onclick="closeModal()" style="background: none; border: none; color: #cccccc; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
            <button onclick="toggleSeasonWatched('${seasonData.seriesId}', ${seasonData.seasonNumber})" style="background: #00d4aa; color: #000000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                ${watchedEpisodes === totalEpisodes ? 'Mark All Unwatched' : 'Mark All Watched'}
            </button>
        </div>
    `;
    
    // Build season info
    const seasonInfo = `
        <div style="display: flex; gap: 20px; margin-bottom: 20px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px;">
            <div style="position: relative;">
                <img src="${seasonData.poster || '/static/no-image.png'}" alt="Season Poster" style="width: 120px; height: 180px; object-fit: cover; border-radius: 8px;" onerror="this.src='/static/no-image.png';">
                <input type="checkbox" ${watchedEpisodes === totalEpisodes ? 'checked' : ''} onchange="toggleSeasonWatched('${seasonData.seriesId}', ${seasonData.seasonNumber})" style="position: absolute; bottom: 4px; left: 4px; transform: scale(1.2);">
            </div>
            <div style="flex: 1;">
                <h2 style="color: #ffffff; margin: 0 0 8px 0; font-size: 1.5em;">Season ${seasonData.seasonNumber}</h2>
                <p style="color: #cccccc; margin: 0 0 8px 0;">
                    ${totalEpisodes} episodes • ${unwatchedEpisodes} unwatched
                </p>
                <p style="color: #cccccc; margin: 0 0 12px 0;">${seasonStatus}</p>
            </div>
        </div>
    `;
    
    // Build episodes list
    const episodesList = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 1.4em;">Episodes</h3>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${seasonData.episodes.map(episode => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                        <input type="checkbox" ${episode.watched ? 'checked' : ''} onchange="toggleEpisodeWatchedInDetails(${seasonData.seriesId}, ${episode.season_number}, ${episode.episode_number}, this.checked)">
                        <div style="flex: 1; cursor: pointer;" onclick="handleEpisodeClick('${seasonData.seriesId}', ${episode.season_number}, ${episode.episode_number})" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'" style="padding: 6px; border-radius: 4px;">
                            <h4 style="color: ${episode.watched ? '#666666' : '#ffffff'}; margin: 0; font-size: 1em; text-decoration: ${episode.watched ? 'line-through' : 'none'};">
                                ${episode.code} - ${episode.title}
                            </h4>
                            <p style="color: #cccccc; margin: 0; font-size: 0.8em;">
                                ${episode.air_date || 'No air date'}
                            </p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    modalContent.innerHTML = header + seasonInfo + episodesList;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}



/**
 * Toggle watched status for entire season
 */
async function toggleSeasonWatched(seriesId, seasonNumber) {
    try {
        // Get all episodes in this season
        const series = currentWatchlistData?.series?.find(s => s.id == seriesId);
        if (!series) return;
        
        const seasonEpisodes = series.episodes.filter(ep => ep.season_number == seasonNumber);
        const allWatched = seasonEpisodes.every(ep => ep.watched);
        const newWatchedStatus = !allWatched;
        
        // Toggle all episodes in the season
        for (const episode of seasonEpisodes) {
            await toggleEpisodeWatched(seriesId, episode.season_number, episode.episode_number);
        }
        
        // Update the season details page instead of reloading the entire watchlist
        const seasonOverlay = document.getElementById('season-overlay');
        if (seasonOverlay) {
            // Re-open season details with updated data
            const updatedSeasonData = {
                seriesId: seriesId,
                seasonNumber: seasonNumber,
                episodes: seasonEpisodes,
                poster: getSeasonPoster(seriesId, seasonNumber),
                totalCount: seasonEpisodes.length,
                watchedCount: seasonEpisodes.filter(ep => ep.watched).length
            };
            closeSeasonDetails();
            showSeasonDetails(updatedSeasonData);
        } else {
            // Only reload watchlist if we're not in season details
            loadWatchlist();
        }
        
    } catch (error) {
        console.error('Error toggling season watched status:', error);
        showError('Failed to update season watched status');
    }
}

/**
 * Toggle watched status for entire collection
 */
async function toggleCollectionWatched(collectionId) {
    try {
        const response = await fetch(`/api/collections/${collectionId}/toggle-watched`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Reload the watchlist to reflect changes
            await loadWatchlist();
            // Refresh the collection details if still open
            const overlay = document.getElementById('collection-overlay');
            if (overlay) {
                // Find the collection data and refresh the view
                if (currentWatchlistData) {
                    const collection = currentWatchlistData.collections.find(c => c.id === collectionId);
                    if (collection) {
                        overlay.remove();
                        showCollectionDetails(collection);
                    }
                }
            }
        } else {
            showError('Failed to update collection watched status');
        }
    } catch (error) {
        console.error('Error toggling collection watched status:', error);
        showError('Failed to update collection watched status');
    }
}

/**
 * Toggle watched status for a movie within a collection
 */
async function toggleMovieInCollection(movieId, watched) {
    try {
        const response = await fetch(`/api/movies/${movieId}/toggle-watched`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ watched })
        });
        
        if (response.ok) {
            // Reload the watchlist to reflect changes
            await loadWatchlist();
            // Refresh the collection details if still open
            const overlay = document.getElementById('collection-overlay');
            if (overlay) {
                // Find the collection data and refresh the view
                if (currentWatchlistData) {
                    const collection = currentWatchlistData.collections.find(c => 
                        c.items.some(m => m.id === movieId)
                    );
                    if (collection) {
                        overlay.remove();
                        showCollectionDetails(collection);
                    }
                }
            }
        } else {
            showError('Failed to update movie watched status');
        }
    } catch (error) {
        console.error('Error toggling movie watched status:', error);
        showError('Failed to update movie watched status');
    }
}

/**
 * Show movie details from within collection view
 */
function showMovieDetails(movieId, movieData) {
    // Parse movieData if it's a string (from JSON.stringify)
    const parsedMovieData = typeof movieData === 'string' ? JSON.parse(movieData) : movieData;
    showDetails('movie', movieId, parsedMovieData);
}

/**
 * Save collection notes
 */
async function saveCollectionNotes(collectionId) {
    const textarea = document.getElementById('collection-notes-textarea');
    const notes = textarea.value;
    
    try {
        const response = await fetch(`/api/collections/${collectionId}/notes`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'text/plain',
                ...getAuthHeaders()
            },
            body: notes
        });
        
        if (response.ok) {
            showSuccess('Notes saved successfully');
            // Reload the watchlist to reflect changes
            await loadWatchlist();
        } else {
            showError('Failed to save notes');
        }
    } catch (error) {
        console.error('Error saving collection notes:', error);
        showError('Failed to save notes');
    }
}

/**
 * Remove collection
 */
async function removeCollection(collectionId) {
    if (confirm('Are you sure you want to remove this collection? This will remove all movies in the collection from your watchlist.')) {
        try {
            const response = await fetch(`/api/collections/${collectionId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                showSuccess('Collection removed successfully');
                closeCollectionDetails();
                await loadWatchlist();
            } else {
                showError('Failed to remove collection');
            }
        } catch (error) {
            console.error('Error removing collection:', error);
            showError('Failed to remove collection');
        }
    }
}

// Function to save notes
async function saveNotes(type, id) {
    const textarea = document.getElementById('notes-textarea');
    const notes = textarea.value;
    
    try {
        const response = await fetch(`/api/${type}s/${id}/notes`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'text/plain',
                ...getAuthHeaders()
            },
            body: notes
        });
        
        if (response.ok) {
            showSuccess('Notes saved successfully!');
            // Update the current watchlist data
            if (currentWatchlistData) {
                if (type === 'movie') {
                    const movie = currentWatchlistData.movies?.find(m => m.id == id);
                    if (movie) movie.notes = notes;
                    // Also check in collections
                    for (const collection of currentWatchlistData.collections || []) {
                        const movie = collection.items?.find(m => m.id == id);
                        if (movie) movie.notes = notes;
                    }
                } else if (type === 'series') {
                    const series = currentWatchlistData.series?.find(s => s.id == id);
                    if (series) series.notes = notes;
                }
            }
        } else {
            showError('Failed to save notes');
        }
    } catch (error) {
        console.error('Error saving notes:', error);
        showError('Failed to save notes');
    }
}

// Function to toggle watched status in details modal
async function toggleWatchedInDetails(type, id, watched) {
    try {
        const endpoint = type === 'movie' ? `/api/watchlist/movie/${id}/toggle` : 
                        type === 'series' ? `/api/watchlist/series/${id}/toggle` : 
                        `/api/watchlist/collection/${id}/toggle`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Update the current watchlist data
            if (currentWatchlistData) {
                if (type === 'movie') {
                    const movie = currentWatchlistData.movies?.find(m => m.id == id);
                    if (movie) movie.watched = watched;
                    // Also check in collections
                    for (const collection of currentWatchlistData.collections || []) {
                        const movie = collection.items?.find(m => m.id == id);
                        if (movie) movie.watched = watched;
                    }
                } else if (type === 'series') {
                    const series = currentWatchlistData.series?.find(s => s.id == id);
                    if (series) series.watched = watched;
                }
            }
            
            // Update the UI to reflect the change
            const statusElement = document.querySelector('p:has(span)');
            if (statusElement) {
                if (type === 'collection' && currentWatchlistData) {
                    const collection = currentWatchlistData.collections?.find(c => c.id == id);
                    if (collection && collection.items) {
                        const totalItems = collection.items.length;
                        const watchedItems = collection.items.filter(m => m.watched).length;
                        
                        if (watchedItems === 0) {
                            statusElement.innerHTML = '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
                        } else if (watchedItems === totalItems) {
                            statusElement.innerHTML = '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>';
                        } else {
                            statusElement.innerHTML = `<span style="color: #ffa500; font-weight: bold;">◐ Partially Watched</span> (${watchedItems}/${totalItems})`;
                        }
                    }
                } else {
                    // For individual movies and series
                    statusElement.innerHTML = watched ? 
                        '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>' : 
                        '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
                }
            }
        } else {
            showError('Failed to update watched status');
        }
    } catch (error) {
        console.error('Error toggling watched status:', error);
        showError('Failed to update watched status');
    }
}

// Function to toggle episode watched status in details modal
async function toggleEpisodeWatchedInDetails(seriesId, seasonNumber, episodeNumber, watched) {
    try {
        const response = await fetch(`/api/series/${seriesId}/episodes/${seasonNumber}/${episodeNumber}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Update the current watchlist data
            if (currentWatchlistData) {
                const series = currentWatchlistData.series?.find(s => s.id == seriesId);
                if (series) {
                    const episode = series.episodes?.find(ep => ep.season_number == seasonNumber && ep.episode_number == episodeNumber);
                    if (episode) {
                        episode.watched = watched;
                        // Update the episode element styling
                        const episodeElement = event.target.closest('div');
                        const titleElement = episodeElement.querySelector('span');
                        if (titleElement) {
                            titleElement.style.color = watched ? '#666666' : '#ffffff';
                            titleElement.style.textDecoration = watched ? 'line-through' : 'none';
                        }
                    }
                }
            }
        } else {
            showError('Failed to update episode watched status');
        }
    } catch (error) {
        console.error('Error toggling episode watched status:', error);
        showError('Failed to update episode watched status');
    }
}

// Smart Omnibox functionality
let currentWatchlistData = null;
let searchDebounceTimer = null;
let lastSearchQuery = '';
let isSearchingResults = false;
let localSearchResults = [];
let importSearchResults = [];

function matchesSearchTerm(item, searchTerm) {
    if (!searchTerm) return true;
    
    const searchFields = [
        item.title,
        item.collection_name,
        item.quality,
        item.release_date,
        item.overview
    ].filter(field => field).map(field => field.toLowerCase());
    
    // Split search term into individual words for more flexible matching
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    // Check if all search words are found in any of the fields
    return searchWords.every(word => 
        searchFields.some(field => field.includes(word))
    );
}

// Initialize Smart Omnibox when page loads
function initializeSmartOmnibox() {
    const searchInput = document.getElementById('importTypeInput');
    const submitBtn = document.getElementById('importTypeSubmitBtn');
    
    // Set initial placeholder and button text
    if (searchInput) {
        searchInput.placeholder = 'Search watchlist or find new content...';
        searchInput.addEventListener('input', handleSmartOmniboxInput);
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSmartOmniboxSubmit();
            }
        });
    }
    
    if (submitBtn) {
        submitBtn.textContent = 'Search';
        submitBtn.addEventListener('click', handleSmartOmniboxSubmit);
    }
}

// Smart Omnibox Input Handler
function handleSmartOmniboxInput(event) {
    const query = event.target.value.trim();
    console.log('🔍 SMART OMNIBOX DEBUG: Input changed to:', query);
    
    // Clear previous debounce timer
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    
    // Always perform local search immediately
    performLocalSearch(query);
    
    // Always update display with local results, but only search externally for 3+ chars
    if (query.length >= 3) {
        searchDebounceTimer = setTimeout(() => {
            performExternalSearch(query);
        }, 1200); // 1.2 second delay
                } else {
        // Clear external results if query is too short, but still update display
        importSearchResults = [];
        updateSearchResultsDisplay();
    }
}

// Smart Omnibox Submit Handler
function handleSmartOmniboxSubmit() {
    const searchInput = document.getElementById('importTypeInput');
    const query = searchInput.value.trim();
    
    if (!query) return;
    
    console.log('🔍 SMART OMNIBOX DEBUG: Submit triggered with query:', query);
    
    // Clear debounce timer
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    
    // Always perform local search immediately
    performLocalSearch(query);
    
    // Only perform external search if we haven't already searched for this query
    // or if the previous search failed
    if (query !== lastSearchQuery || !isSearchingResults) {
        console.log('🔍 SMART OMNIBOX DEBUG: Triggering external search for submit');
        performExternalSearch(query);
    } else {
        console.log('🔍 SMART OMNIBOX DEBUG: External search already in progress or completed for this query');
        // Still update display with current results
        updateSearchResultsDisplay();
    }
}

// Perform Local Search (immediate)
function performLocalSearch(query) {
    console.log('🔍 SMART OMNIBOX DEBUG: Performing local search for:', query);
    console.log('🔍 SMART OMNIBOX DEBUG: currentWatchlistData:', currentWatchlistData);
    
    if (!query || !currentWatchlistData) {
        localSearchResults = [];
        updateSearchResultsDisplay();
        return;
    }
    
    // Search through watchlist data
    const results = [];
    const searchTerm = query.toLowerCase();
    
    // Search movies
    if (currentWatchlistData.movies) {
        console.log('🔍 SMART OMNIBOX DEBUG: Searching', currentWatchlistData.movies.length, 'movies');
        currentWatchlistData.movies.forEach(movie => {
            if (matchesSearchTerm(movie, searchTerm)) {
                console.log('🔍 SMART OMNIBOX DEBUG: Found matching movie:', movie.title);
                results.push({
                    ...movie,
                    type: 'movie',
                    source: 'local'
                });
            }
        });
    }
    
    // Search series
    if (currentWatchlistData.series) {
        console.log('🔍 SMART OMNIBOX DEBUG: Searching', currentWatchlistData.series.length, 'series');
        currentWatchlistData.series.forEach(series => {
            if (matchesSearchTerm(series, searchTerm)) {
                console.log('🔍 SMART OMNIBOX DEBUG: Found matching series:', series.title);
                results.push({
                    ...series,
                    type: 'series',
                    source: 'local'
                });
            }
        });
    }
    
    // Search collections
    if (currentWatchlistData.collections) {
        console.log('🔍 SMART OMNIBOX DEBUG: Searching', currentWatchlistData.collections.length, 'collections');
        currentWatchlistData.collections.forEach(collection => {
            console.log('🔍 SMART OMNIBOX DEBUG: Checking collection:', collection.title || collection.collection_name);
            console.log('🔍 SMART OMNIBOX DEBUG: Collection data:', collection);
            console.log('🔍 SMART OMNIBOX DEBUG: Search term:', searchTerm);
            const matches = matchesSearchTerm(collection, searchTerm);
            console.log('🔍 SMART OMNIBOX DEBUG: Matches?', matches);
            if (matches) {
                console.log('🔍 SMART OMNIBOX DEBUG: Found matching collection:', collection.title || collection.collection_name);
                results.push({
                    ...collection,
                    type: 'collection',
                    source: 'local'
                });
            }
        });
    }
    
    localSearchResults = results;
    console.log('🔍 SMART OMNIBOX DEBUG: Local search found', results.length, 'results:', results.map(r => r.title || r.collection_name));
    
    // Update display immediately for short queries (when external search won't run)
    if (query.length < 3) {
        console.log('🔍 SMART OMNIBOX DEBUG: Short query, updating display immediately');
        updateSearchResultsDisplay();
    } else {
        console.log('🔍 SMART OMNIBOX DEBUG: Long query, waiting for external search to update display');
    }
}

// Perform External Search (debounced)
async function performExternalSearch(query) {
    console.log('🔍 SMART OMNIBOX DEBUG: Performing external search for:', query);
    
    if (!query || query.length < 3 || isSearchingResults || query === lastSearchQuery) {
        return;
    }
    
    lastSearchQuery = query;
    isSearchingResults = true;
    
    try {
        console.log('🔍 IMPORT DEBUG: Making request to:', `${API_BASE}/search/all/?query=${encodeURIComponent(query)}`);
        const response = await fetch(`${API_BASE}/search/all/?query=${encodeURIComponent(query)}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const results = await response.json();
        console.log('🔍 IMPORT DEBUG: External search results:', results);
        
        importSearchResults = results || [];
        console.log('🔍 SMART OMNIBOX DEBUG: External search complete, updating display with', importSearchResults.length, 'import results');
        console.log('🔍 SMART OMNIBOX DEBUG: Local results still available:', localSearchResults.length);
        updateSearchResultsDisplay();
        
    } catch (error) {
        console.error('🔍 IMPORT DEBUG: External search failed:', error);
        importSearchResults = [];
        console.log('🔍 SMART OMNIBOX DEBUG: External search failed, updating display with 0 import results');
        updateSearchResultsDisplay();
    } finally {
        isSearchingResults = false;
    }
}

// Update Search Results Display (Hybrid UI)
function updateSearchResultsDisplay() {
    console.log('🔍 SMART OMNIBOX DEBUG: Updating search results display');
    console.log('🔍 SMART OMNIBOX DEBUG: Local results:', localSearchResults.length, localSearchResults);
    console.log('🔍 SMART OMNIBOX DEBUG: Import results:', importSearchResults.length, importSearchResults);
    
    const searchInput = document.getElementById('importTypeInput');
    const query = searchInput ? searchInput.value.trim() : '';
    
    // If no query, hide search results and show normal watchlist
    if (!query) {
        hideSearchResults();
        if (currentWatchlistData) {
            renderWatchlist(currentWatchlistData);
        }
        return;
    }
    
    // Hide the normal watchlist content
    const watchlistContent = document.getElementById('watchlistContent');
    console.log('🔍 SMART OMNIBOX DEBUG: watchlistContent element:', watchlistContent);
    if (watchlistContent) {
        watchlistContent.style.display = 'none';
        console.log('🔍 SMART OMNIBOX DEBUG: Hidden watchlistContent');
    } else {
        console.error('🔍 SMART OMNIBOX DEBUG: watchlistContent not found!');
    }
    
    // Show search results overlay and clear all existing content
    showSearchResultsOverlay();
    
    // Always display local results FIRST, then import results SECOND
    // This ensures correct order regardless of which search completes first
    console.log('🔍 SMART OMNIBOX DEBUG: About to display local results:', localSearchResults.length, localSearchResults);
    displayLocalSearchResults();
    console.log('🔍 SMART OMNIBOX DEBUG: About to display import results:', importSearchResults.length, importSearchResults);
    displayImportSearchResults();
}

// Show Search Results Overlay
function showSearchResultsOverlay() {
    // Get the existing search results container
    const searchContainer = document.getElementById('smartOmniboxResults');
    console.log('🔍 SMART OMNIBOX DEBUG: searchContainer element:', searchContainer);
    if (!searchContainer) {
        console.error('🔍 SMART OMNIBOX DEBUG: smartOmniboxResults container not found!');
        return;
    }
    
    // Clear ALL previous content completely
    searchContainer.innerHTML = '';
    console.log('🔍 SMART OMNIBOX DEBUG: Cleared search container content completely');
    
    // Show the search results container
    searchContainer.style.display = 'block';
    console.log('🔍 SMART OMNIBOX DEBUG: Showed search container');
}

// Hide Search Results Overlay
function hideSearchResults() {
    const searchContainer = document.getElementById('smartOmniboxResults');
    if (searchContainer) {
        searchContainer.style.display = 'none';
    }
    
    // Show the normal watchlist content again
    const watchlistContent = document.getElementById('watchlistContent');
    if (watchlistContent) {
        watchlistContent.style.display = 'block';
    }
}

// Display Local Search Results (Filtered Watchlist Format)
function displayLocalSearchResults() {
    console.log('🔍 SMART OMNIBOX DEBUG: displayLocalSearchResults called with', localSearchResults.length, 'results');
    const searchContainer = document.getElementById('smartOmniboxResults');
    if (!searchContainer) {
        console.error('🔍 SMART OMNIBOX DEBUG: searchContainer not found in displayLocalSearchResults');
        return;
    }
    
    // Remove ALL existing local sections first
    const existingLocals = searchContainer.querySelectorAll('.local-search-section');
    existingLocals.forEach(section => section.remove());
    
    // Only create local section if there are results
    if (localSearchResults.length === 0) {
        console.log('🔍 SMART OMNIBOX DEBUG: No local results to display');
        return;
    }
    
    // Create local section container
    const localSection = document.createElement('div');
    localSection.className = 'local-search-section';
    localSection.innerHTML = `
        <div class="search-section-header">
            <h3>In Your Watchlist (${localSearchResults.length})</h3>
        </div>
        <div class="watchlist-list">
            ${localSearchResults.map(item => createLocalResultItem(item)).join('')}
        </div>
    `;
    
    // Append new local section
    searchContainer.appendChild(localSection);
    searchContainer.style.display = 'block';
    console.log('🔍 SMART OMNIBOX DEBUG: Added local section with', localSearchResults.length, 'results');
}

// Display Import Search Results (6-Across Grid)
function displayImportSearchResults() {
    const searchContainer = document.getElementById('smartOmniboxResults');
    if (!searchContainer) return;
    
    // Remove ALL existing import sections first
    const existingImports = searchContainer.querySelectorAll('.import-search-section');
    existingImports.forEach(section => section.remove());
    
    // Only create import section if there are results
    if (importSearchResults.length === 0) {
        console.log('🔍 SMART OMNIBOX DEBUG: No import results to display');
        return;
    }
    
    // Create import section container
    const importSection = document.createElement('div');
    importSection.className = 'import-search-section';
    importSection.innerHTML = `
        <div class="search-section-header">
            <h3>Available to Import (${importSearchResults.length})</h3>
        </div>
        <div class="import-results-grid">
            ${importSearchResults.map(item => createImportResultCard(item)).join('')}
        </div>
    `;
    
    // Append new import section
    searchContainer.appendChild(importSection);
    searchContainer.style.display = 'block';
    console.log('🔍 SMART OMNIBOX DEBUG: Added import section with', importSearchResults.length, 'results');
}

// Create Local Result Item (uses actual watchlist row HTML)
function createLocalResultItem(item) {
    // Use the same poster URL logic as the rest of the app
    let poster = item.poster_url || '/static/no-image.png';
    if (poster && poster.startsWith('/')) {
        poster = poster;
    } else if (poster && !poster.startsWith('http')) {
        poster = '/static/posters/' + poster;
    }
    
    const title = item.title || item.collection_name || 'Unknown';
    const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
    const type = item.type === 'collection' ? 'Collection' : (item.type === 'series' ? 'Series' : 'Movie');
    const watched = item.watched ? 'checked' : '';
    
    // Check if item is newly imported
    const isNewlyImported = isItemNewlyImported(item.type, item.id);
    console.log(`🔍 LOCAL RESULT DEBUG: Item ${item.id} (${title}) - isNewlyImported: ${isNewlyImported}`);
    const newlyImportedBadge = isNewlyImported ? '<span class="newly-imported-badge"><svg class="badge-icon" viewBox="0 0 16 16"><path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 7.5l-1.4 1.4L7 6.8V2h2v4.2L10.6 9z"/></svg>NEW</span>' : '';
    
    // Use the actual watchlist row HTML structure
    if (item.type === 'collection') {
        const unwatchedCount = item.items ? item.items.filter(movie => !movie.watched).length : 0;
        return `
            <div class="watchlist-row collection-row" data-collection-id="${item.id}">
                <input type="checkbox" class="checkbox" data-type="collection" data-id="${item.id}" ${watched}>
                <div class="clickable-area" data-type="collection" data-id="${item.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
                    <img src="${poster}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                    <div class="title">${title}${newlyImportedBadge}</div>
                    <div class="meta">Collection (${item.items ? item.items.length : 0} movies; ${unwatchedCount} unwatched)</div>
                </div>
                <span class="expand-icon" data-type="collection" data-id="${item.id}">▼</span>
                <span title="Remove" class="remove-btn" data-type="collection" data-id="${item.id}">🗑️</span>
            </div>
        `;
    } else {
        return `
            <div class="watchlist-row" data-item-id="${item.id}" data-item-type="${item.type}">
                <input type="checkbox" class="checkbox" data-type="${item.type}" data-id="${item.id}" ${watched}>
                <div class="clickable-area" data-type="${item.type}" data-id="${item.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
                    <img src="${poster}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                    <div class="title">${title}${newlyImportedBadge}</div>
                    <div class="meta">${type}${year ? ` • ${year}` : ''}</div>
                </div>
                <span title="Remove" class="remove-btn" data-type="${item.type}" data-id="${item.id}">🗑️</span>
            </div>
        `;
    }
}

// Create Import Result Card
function createImportResultCard(item) {
    const poster = item.poster_url && item.poster_url.startsWith('http') ? item.poster_url : '/static/no-image.png';
    const title = item.title || 'Unknown';
    const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
    const type = item.type === 'series' ? 'Series' : 'Movie';
    const buttonText = item.type === 'series' ? 'Import Series' : 'Import Movie';
    const buttonOnclick = item.type === 'series' ? `importFullSeries('${item.imdb_id}')` : `importItemWithSequels('${item.imdb_id}')`;
    
    // Get the ID for display (IMDB or TMDB)
    const displayId = item.imdb_id ? `IMDB: ${item.imdb_id}` : (item.tmdb_id ? `TMDB: ${item.tmdb_id}` : '');
    
    return `
        <div class="search-result-card" onclick="${buttonOnclick}" title="${buttonText}">
            <img src="${poster}" alt="Poster" class="search-result-poster" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="search-result-info">
                <div class="search-result-title">${title}</div>
                <div class="search-result-meta">${displayId}</div>
                <button class="import-btn ${item.type === 'series' ? 'import-series-btn' : 'import-movie-btn'}" onclick="event.stopPropagation(); ${buttonOnclick}">${buttonText}</button>
            </div>
        </div>
    `;
}

// Navigate to Item (for local results)
function navigateToItem(itemId, itemType) {
    console.log('🔍 SMART OMNIBOX DEBUG: Navigating to item:', itemId, itemType);
    // This would navigate to the item's details page
    // For now, we'll just clear the search
    clearSmartOmniboxSearch();
}

// Clear Smart Omnibox Search
function clearSmartOmniboxSearch() {
    const searchInput = document.getElementById('importTypeInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    localSearchResults = [];
    importSearchResults = [];
    lastSearchQuery = '';
    
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    
    hideSearchResults();
    
    if (currentWatchlistData) {
        renderWatchlist(currentWatchlistData);
    }
}

// Go Home - Clear search and return to main watchlist
function goHome() {
    console.log('🏠 Going home - clearing search and returning to main watchlist');
    clearSmartOmniboxSearch();
}

function clearSearchResults() {
    clearSmartOmniboxSearch();
}

// Check for service worker updates
async function checkForUpdates() {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            registration.update();
        }
    }
}

// Initialize PWA features
function initializePWA() {
    // Check for updates periodically
    setInterval(checkForUpdates, 60000); // Check every minute
    
    // Handle app install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // You could show an install button here
        console.log('App install prompt available');
    });
    
    // Handle app launch
    window.addEventListener('appinstalled', () => {
        console.log('App was installed');
        deferredPrompt = null;
    });
}

// Initialize PWA when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePWA);

// Function to reset sort option if something goes wrong
function resetSortOption() {
    console.log('Resetting sort option to default');
    watchlistState.sortBy = 'alphabetical';
    updateFilterState(); // Save to localStorage
    updateSortButtonText();
}

// Function to ensure watchlistState is properly initialized
function ensureWatchlistStateInitialized() {
    if (!watchlistState.sortBy) {
        console.log('watchlistState.sortBy is undefined, setting default');
        watchlistState.sortBy = 'alphabetical';
        updateFilterState(); // Save to localStorage
    }
    
    if (!watchlistFilters) {
        console.log('watchlistFilters is undefined, setting default');
        setDefaultFilterState();
    }
    
    
}

// Debug function to help troubleshoot sorting issues
function debugSortState() {
    console.log('=== SORT STATE DEBUG ===');
    console.log('watchlistState:', watchlistState);
    console.log('watchlistFilters:', watchlistFilters);
    console.log('localStorage watchlistState:', localStorage.getItem('watchlistState'));
    console.log('localStorage watchlistFilters:', localStorage.getItem('watchlistFilters'));
    console.log('=======================');
}

function updateSortButtonText() {
    const sortButton = document.querySelector('.settings-item[onclick="showSortOptions()"]');
    if (sortButton) {
        const currentSort = watchlistState.sortBy || 'alphabetical';
        const sortLabels = {
            'alphabetical': 'A-Z',
            'alphabetical_reverse': 'Z-A',
            'release_date': 'Oldest',
            'release_date_newest': 'Newest',
            'added': 'Earliest',
            'added_newest': 'Latest'
        };
        
        const label = sortLabels[currentSort] || 'A-Z';
        sortButton.innerHTML = `<span>📊</span> Sort (${label})`;
    }
}

// Global filter options for the new iOS-like filter UI
const filterOptions = [
    { key: 'unwatched', label: 'Unwatched Only', icon: '👁️', description: 'Show only unwatched items' },
    { key: 'movies', label: 'Movies', icon: '🎬', description: 'Show movies in watchlist' },
    { key: 'series', label: 'TV Shows', icon: '📺', description: 'Show TV series in watchlist' },
    { key: 'runtime_under_30', label: '<30 min', icon: '⏱️', description: 'Show items under 30 minutes' },
    { key: 'runtime_30_60', label: '30-60 min', icon: '⏱️', description: 'Show items 30-60 minutes' },
    { key: 'runtime_60_90', label: '60-90 min', icon: '⏱️', description: 'Show items 60-90 minutes' },
    { key: 'runtime_over_90', label: '>90 min', icon: '⏱️', description: 'Show items over 90 minutes' }
];

// ============================================================================
// LIST MANAGEMENT FUNCTIONALITY
// ============================================================================

// Global state for list management
let userLists = [];
let selectedListIds = ['personal']; // Default to personal list
let selectedIcon = '📋';
let selectedColor = '#007AFF';

// Load saved state from localStorage
function loadSavedState() {
    try {
        const savedSelectedLists = localStorage.getItem('selectedListIds');
        if (savedSelectedLists) {
            selectedListIds = JSON.parse(savedSelectedLists);
        }
        
        const savedListOrder = localStorage.getItem('listOrder');
        if (savedListOrder) {
            // Apply saved order to userLists when they're loaded
            window.savedListOrder = JSON.parse(savedListOrder);
        }
    } catch (error) {
        console.error('Error loading saved state:', error);
        // Fallback to defaults
        selectedListIds = ['personal'];
    }
}

// Save state to localStorage
function saveState() {
    try {
        localStorage.setItem('selectedListIds', JSON.stringify(selectedListIds));
        
        // Save list order
        if (userLists.length > 0) {
            const listOrder = userLists.map(list => list.id);
            localStorage.setItem('listOrder', JSON.stringify(listOrder));
        }
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

// Initialize list management when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Load saved state first
    loadSavedState();
    
    // Initialize list management
    initializeListManagement();
    
    // Add event listeners
    const createListBtn = document.getElementById('createListBtn');
    if (createListBtn) {
        createListBtn.addEventListener('click', showCreateListModal);
    }
});

// Toggle list management visibility
function toggleListManagement() {
    const container = document.getElementById('listManagementContainer');
    if (container) {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';
        
        // Update the menu item text
        const menuItem = document.querySelector('.settings-item[onclick="toggleListManagement()"]');
        if (menuItem) {
            if (isVisible) {
                menuItem.innerHTML = '<span>📋</span> Lists';
            } else {
                menuItem.innerHTML = '<span>📋</span> Lists (Active)';
            }
        }
    }
}

// Initialize list management
async function initializeListManagement() {
    try {
        await loadUserLists();
        renderListSelector();
    } catch (error) {
        console.error('Failed to initialize list management:', error);
    }
}

// Load user lists from backend
async function loadUserLists() {
    try {
        const response = await fetch(`${API_BASE}/lists`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        userLists = data.lists || [];
        
        // Apply saved list order if available
        if (window.savedListOrder && userLists.length > 0) {
            const orderedLists = [];
            const savedOrder = window.savedListOrder;
            
            // Add lists in saved order
            savedOrder.forEach(listId => {
                const list = userLists.find(l => l.id === listId);
                if (list) {
                    orderedLists.push(list);
                }
            });
            
            // Add any new lists that weren't in the saved order
            userLists.forEach(list => {
                if (!savedOrder.includes(list.id)) {
                    orderedLists.push(list);
                }
            });
            
            userLists = orderedLists;
        }
        
        // Update personal list count if we have watchlist data
        const watchlistData = window.lastWatchlistData || window.currentWatchlistData;
        if (watchlistData) {
            const personalList = userLists.find(list => list.id === 'personal');
            if (personalList) {
                const totalItems = (watchlistData.movies?.length || 0) + 
                                 (watchlistData.series?.length || 0) + 
                                 (watchlistData.collections?.length || 0);
                personalList.item_count = totalItems;
                console.log('Updated personal list count in loadUserLists to:', totalItems);
            }
        }
        
        console.log('Loaded user lists:', userLists);
        
        // Validate selectedListIds - remove any lists that don't exist anymore
        const validListIds = userLists.map(list => list.id);
        const validSelectedIds = selectedListIds.filter(id => id === 'personal' || validListIds.includes(id));
        
        // If no valid lists are selected, default to personal
        if (validSelectedIds.length === 0) {
            validSelectedIds.push('personal');
        }
        
        // Update selectedListIds if it changed
        if (JSON.stringify(selectedListIds) !== JSON.stringify(validSelectedIds)) {
            console.log('🧹 Cleaning up stale selectedListIds:', selectedListIds, '→', validSelectedIds);
            selectedListIds = validSelectedIds;
        }
        
        // Save state after loading lists
        saveState();
        
    } catch (error) {
        console.error('Error loading user lists:', error);
        // Fallback to just personal list
        userLists = [{
            id: 'personal',
            name: 'My Watchlist',
            description: 'Your personal watchlist',
            type: 'personal',
            color: '#007AFF',
            icon: '📱',
            is_active: true,
            item_count: 0,
            created_at: new Date(),
            owner: 'you'
        }];
    }
}

// Render the list selector UI
function renderListSelector() {
    const listSelector = document.getElementById('listSelector');
    if (!listSelector) return;

    listSelector.innerHTML = '';

    userLists.forEach(list => {
        const listChip = document.createElement('div');
        listChip.className = `list-chip ${selectedListIds.includes(list.id) ? 'active' : ''}`;
        listChip.onclick = () => toggleListSelection(list.id);
        
        // Apply list color to chip background and border when active
        const isActive = selectedListIds.includes(list.id);
        const listColor = list.color || '#007AFF';
        
        if (isActive) {
            // Use the list's color for active state
            listChip.style.backgroundColor = `${listColor}20`; // 20% opacity
            listChip.style.borderColor = listColor;
            listChip.style.boxShadow = `0 0 0 2px ${listColor}30`; // 30% opacity
        }
        
        listChip.innerHTML = `
            <span class="list-icon">${list.icon || '📋'}</span>
            <span class="list-name">${list.name}</span>
            <span class="list-count">${list.item_count || 0}</span>
        `;
        
        listSelector.appendChild(listChip);
    });
}

// Update background based on active lists
function updateBackgroundForActiveLists(activeLists) {
    const body = document.body;
    
    if (activeLists.length === 0) {
        // Reset to default background
        body.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 70%, #533483 100%)';
        return;
    }
    
    if (activeLists.length === 1) {
        // Single list - use its background color if available
        const list = activeLists[0];
        if (list.background_color && list.background_color !== '#1a1a2e') {
            body.style.background = `linear-gradient(135deg, ${list.background_color} 0%, #16213e 50%, #533483 100%)`;
        } else {
            // Reset to default if no custom background
            body.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 70%, #533483 100%)';
        }
        return;
    }
    
    // Multiple lists - create gradient from their background colors
    const validColors = activeLists
        .map(list => list.background_color || '#1a1a2e')
        .filter(color => color && color !== '#1a1a2e');
    
    if (validColors.length > 1) {
        // Create multi-color gradient
        const gradientStops = validColors.map((color, index) => {
            const percentage = (index / (validColors.length - 1)) * 100;
            return `${color} ${percentage}%`;
        }).join(', ');
        
        body.style.background = `linear-gradient(135deg, ${gradientStops})`;
    } else if (validColors.length === 1) {
        // One custom color with default fallback
        body.style.background = `linear-gradient(135deg, ${validColors[0]} 0%, #16213e 50%, #533483 100%)`;
    } else {
        // No custom colors, use default
        body.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 70%, #533483 100%)';
    }
}

// Toggle list selection
function toggleListSelection(listId) {
    const index = selectedListIds.indexOf(listId);
    
    if (index > -1) {
        // Remove from selection
        selectedListIds.splice(index, 1);
        
        // Allow deselecting personal list, but ensure at least one list is selected
        if (selectedListIds.length === 0) {
            alert('Please select at least one list to view');
            selectedListIds.push('personal'); // Re-add personal as fallback
        }
    } else {
        // Add to selection
        selectedListIds.push(listId);
    }

    console.log('Selected list IDs:', selectedListIds);
    
    // Save state and update UI
    saveState();
    renderListSelector();
    loadWatchlist(); // Reload watchlist with new list selection
}

// Show create list modal
function showCreateListModal() {
    const modal = document.getElementById('createListModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('listNameInput').focus();
        
        // Reset selections to defaults
        selectedIcon = '📋';
        selectedColor = '#007AFF';
        updateIconSelection();
        updateColorSelection();
    }
}

// Select an icon for the new list
function selectIcon(icon) {
    selectedIcon = icon;
    updateIconSelection();
}

// Update the visual selection state of icons
function updateIconSelection() {
    document.querySelectorAll('.icon-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.icon === selectedIcon) {
            btn.classList.add('selected');
        }
    });
}

// Select a color for the new list
function selectColor(color) {
    selectedColor = color;
    updateColorSelection();
}

// Update the visual selection state of colors
function updateColorSelection() {
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.color === selectedColor) {
            btn.classList.add('selected');
        }
    });
}

// Close create list modal
function closeCreateListModal() {
    const modal = document.getElementById('createListModal');
    if (modal) {
        modal.style.display = 'none';
        // Clear inputs
        document.getElementById('listNameInput').value = '';
        document.getElementById('listDescriptionInput').value = '';
    }
}

// Create new list
async function createNewList() {
    const name = document.getElementById('listNameInput').value.trim();
    const description = document.getElementById('listDescriptionInput').value.trim();

    if (!name) {
        alert('Please enter a list name');
        return;
    }

    try {
        console.log('Creating list with data:', { name, description, type: 'custom' });
        
        const response = await fetch(`${API_BASE}/lists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: description,
                type: 'custom',
                color: selectedColor,
                icon: selectedIcon,
                background_color: window.selectedBackgroundColor || '#1a1a2e'
            })
        });

        console.log('Create list response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Create list error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
        }

        const newList = await response.json();
        console.log('Created new list:', newList);

        // Add to user lists and select it
        userLists.push(newList);
        selectedListIds.push(newList.id);
        
        // Update UI
        renderListSelector();
        closeCreateListModal();
        
        // Reload lists to refresh the data
        await loadUserLists();
        renderListSelector();
        
        // Show success message
        if (typeof showSuccess === 'function') {
            showSuccess(`List "${name}" created successfully!`);
        } else {
            alert(`List "${name}" created successfully!`);
        }
    } catch (error) {
        console.error('Error creating list:', error);
        alert(`Failed to create list: ${error.message}`);
    }
}

// Get items from selected lists
async function getItemsFromSelectedLists() {
    try {
        if (selectedListIds.includes('personal')) {
            // If personal list is selected, get all items
            return null; // This will trigger the default watchlist loading
        }

        // For custom lists, fetch items from each selected list
        const allItems = {
            movies: [],
            series: [],
            collections: {}
        };

        for (const listId of selectedListIds) {
            if (listId === 'personal') continue;
            
            const response = await fetch(`${API_BASE}/lists/${listId}/items`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const listData = await response.json();
                
                // Debug logging to see what we're getting
                console.log(`🔍 List ${listId} returned:`, listData);
                console.log(`🔍 Movies: ${listData.movies?.length || 0}`);
                console.log(`🔍 Series: ${listData.series?.length || 0}`);
                console.log(`🔍 Collections: ${Object.keys(listData.collections || {}).length}`);
                
                // Merge movies
                if (listData.movies) {
                    allItems.movies.push(...listData.movies);
                }
                
                // Merge series
                if (listData.series) {
                    allItems.series.push(...listData.series);
                }
                
                // Merge collections
                if (listData.collections) {
                    for (const collection of listData.collections) {
                        if (collection.id in allItems.collections) {
                            allItems.collections[collection.id].movies.push(...collection.movies);
                        } else {
                            allItems.collections[collection.id] = collection;
                        }
                    }
                }
            } else if (response.status === 404) {
                // List doesn't exist (probably deleted or DB was reset)
                console.warn(`⚠️ List ${listId} not found (404) - removing from selected lists`);
                
                // Remove this list from selectedListIds
                const index = selectedListIds.indexOf(listId);
                if (index > -1) {
                    selectedListIds.splice(index, 1);
                }
                
                // If no lists are selected now, default to personal
                if (selectedListIds.length === 0) {
                    selectedListIds.push('personal');
                }
                
                // Save the updated state
                saveState();
                
                // Update the UI
                renderListSelector();
            } else {
                console.error(`❌ Error fetching list ${listId}:`, response.status, response.statusText);
            }
        }

        return allItems;
    } catch (error) {
        console.error('Error fetching list items:', error);
        return null;
    }
}

// Override the existing loadWatchlist function to support multiple lists
const originalLoadWatchlist = window.loadWatchlist;
window.loadWatchlist = async function() {
    try {
        // Check if we need to load from specific lists
        const listItems = await getItemsFromSelectedLists();
        
        if (listItems && selectedListIds.length > 0 && !selectedListIds.includes('personal')) {
            // Load from specific custom lists
            console.log('Loading from custom lists:', selectedListIds);
            console.log('🔍 Custom list data received:', listItems);
            console.log('🔍 Total items in custom lists:', {
                movies: listItems.movies?.length || 0,
                series: listItems.series?.length || 0,
                collections: Object.keys(listItems.collections || {}).length
            });
            
            // Store the list data for rendering
            window.currentWatchlistData = listItems;
            window.lastWatchlistData = listItems;
            
            // Render the watchlist with the list data
            renderWatchlistFromData(listItems);
            
            // Update list counts
            updateListCounts();
            
            return listItems;
        } else {
            // Load from personal watchlist (default behavior)
            console.log('Loading from personal watchlist');
            
            // Call the original function
            if (originalLoadWatchlist) {
                try {
                    console.log('🔍 Calling original loadWatchlist...');
                    const result = await originalLoadWatchlist();
                    console.log('🔍 Original loadWatchlist completed successfully:', result);
                    
                    // Update list counts after watchlist loads
                    setTimeout(() => {
                        updateListCounts();
                    }, 100);
                    
                    return result;
                } catch (error) {
                    console.error('🔍 Error in original loadWatchlist:', error);
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error in list-aware loadWatchlist:', error);
        // Fallback to original function
        if (originalLoadWatchlist) {
            return originalLoadWatchlist();
        }
    }
};

// Render watchlist from list data
function renderWatchlistFromData(watchlistData) {
    const watchlistContent = document.getElementById('watchlistContent');
    if (!watchlistContent) return;

    let html = '<div class="watchlist-header">';
    
    // Show which lists are active and update background
    const activeLists = userLists.filter(list => selectedListIds.includes(list.id));
    updateBackgroundForActiveLists(activeLists);
    
    if (activeLists.length > 0) {
        html += '<div class="active-lists-indicator">';
        html += '<span class="indicator-label">📋 Viewing:</span>';
        activeLists.forEach(list => {
            html += `<span class="list-indicator" style="color: ${list.color || '#007AFF'}">${list.icon} ${list.name}</span>`;
        });
        html += '</div>';
    }
    
    html += '</div>';

    // Combine all items into a unified list for consistent UI
    const allItems = [];
    
    // Add movies with type marker
    if (watchlistData.movies && watchlistData.movies.length > 0) {
        watchlistData.movies.forEach(movie => {
            allItems.push({ ...movie, _itemType: 'movie' });
        });
    }
    
    // Add series with type marker
    if (watchlistData.series && watchlistData.series.length > 0) {
        watchlistData.series.forEach(series => {
            allItems.push({ ...series, _itemType: 'series' });
        });
    }
    
    // Add collections with type marker
    if (watchlistData.collections && Object.keys(watchlistData.collections).length > 0) {
        Object.values(watchlistData.collections).forEach(collection => {
            allItems.push({ ...collection, _itemType: 'collection' });
        });
    }
    
    // Sort items (new items first, then by release date)
    allItems.sort((a, b) => {
        const aIsNew = a.is_new || false;
        const bIsNew = b.is_new || false;
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && !bIsNew) return 1;
        return 0;
    });
    
    // Render unified list using the same UI as main watchlist
    if (allItems.length > 0) {
        html += '<div class="watchlist-list">';
        for (const item of allItems) {
            if (item._itemType === 'collection') {
                html += renderUnifiedCollection(item);
            } else if (item._itemType === 'series') {
                html += renderUnifiedSeries(item);
            } else if (item._itemType === 'movie') {
                html += renderUnifiedMovie(item);
            }
        }
        html += '</div>';
    } else {
        // Show empty state
        html += '<div class="empty-state">';
        html += '<div class="empty-icon">📋</div>';
        html += '<h3>No items in selected lists</h3>';
        html += '<p>Select different lists or add items to your custom lists.</p>';
        html += '</div>';
    }

    // Set the HTML content
    watchlistContent.innerHTML = html;
    
    // Add event listeners for the unified list (same as main watchlist)
    setTimeout(() => {
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = function(e) {
                e.stopPropagation();
                const type = btn.getAttribute('data-type');
                const id = btn.getAttribute('data-id');
                removeFromWatchlist(type, id);
            };
        });
        
        // Add event listeners for clickable areas (poster, title, meta)
        document.querySelectorAll('.clickable-area').forEach(area => {
            // Skip if element already has an onclick handler (like episodes)
            if (area.onclick) {
                return;
            }
            
            area.onclick = function(e) {
                e.stopPropagation();
                const type = area.getAttribute('data-type');
                let id = area.getAttribute('data-id');
                
                // Find the item data from currentWatchlistData
                let itemData = null;
                if (watchlistData) {
                    if (type === 'movie') {
                        itemData = watchlistData.movies?.find(m => m.id == id);
                    } else if (type === 'series') {
                        itemData = watchlistData.series?.find(s => s.id == id);
                    } else if (type === 'collection') {
                        itemData = watchlistData.collections?.find(c => c.id == id);
                    }
                }
                
                showDetails(type, id, itemData);
            };
        });
    }, 0);
}

// Helper function to render movie card (simplified version)
function renderMovieCard(movie) {
    return `
        <div class="movie-card" data-id="${movie.id}" data-type="movie">
            <div class="poster-container">
                <img src="${movie.poster_url || '/static/no-image.png'}" alt="${movie.title}" class="poster">
                <div class="movie-overlay">
                    <button class="btn btn-sm btn-primary" onclick="markAsWatched(${movie.id}, 'movie')">
                        ${movie.watched ? '✅ Watched' : '👁️ Mark Watched'}
                    </button>
                </div>
            </div>
            <div class="movie-info">
                <h4>${movie.title}</h4>
                <p class="movie-meta">${movie.release_date || 'Unknown year'}</p>
                ${movie.notes ? `<p class="movie-notes">${movie.notes}</p>` : ''}
            </div>
        </div>
    `;
}

// Helper function to render series card (simplified version)
function renderSeriesCard(series) {
    return `
        <div class="series-card" data-id="${series.id}" data-type="series">
            <div class="poster-container">
                <img src="${series.poster_url || '/static/no-image.png'}" alt="${series.title}" class="poster">
                <div class="series-overlay">
                    <button class="btn btn-sm btn-primary" onclick="viewSeriesDetails(${series.id})">
                        📺 View Episodes
                    </button>
                </div>
            </div>
            <div class="series-info">
                <h4>${series.title}</h4>
                <p class="series-meta">${series.episodes?.length || 0} episodes</p>
                ${series.notes ? `<p class="series-notes">${series.notes}</p>` : ''}
            </div>
        </div>
    `;
}

// Helper function to render collection card (simplified version)
function renderCollectionCard(collection) {
    return `
        <div class="collection-card" data-id="${collection.id}" data-type="collection">
            <div class="poster-container">
                <img src="${collection.poster_url || '/static/no-image.png'}" alt="${collection.name}" class="poster">
                <div class="collection-overlay">
                    <button class="btn btn-sm btn-primary" onclick="viewCollectionDetails(${collection.id})">
                        🎭 View Collection
                    </button>
                </div>
            </div>
            <div class="collection-info">
                <h4>${collection.name}</h4>
                <p class="collection-meta">${collection.movies?.length || 0} movies</p>
            </div>
        </div>
    `;
}

// Update list counts based on current watchlist data
function updateListCounts() {
    // Try to get watchlist data from different sources
    const watchlistData = window.lastWatchlistData || window.currentWatchlistData;
    
    if (watchlistData && userLists.length > 0) {
        // Only update personal list count if we're actually viewing the personal watchlist
        // Don't update it when viewing custom lists
        const isViewingPersonalList = selectedListIds.includes('personal') || selectedListIds.length === 0;
        
        if (isViewingPersonalList) {
            const personalList = userLists.find(list => list.id === 'personal');
            if (personalList) {
                const totalItems = (watchlistData.movies?.length || 0) + 
                                 (watchlistData.series?.length || 0) + 
                                 (watchlistData.collections?.length || 0);
                personalList.item_count = totalItems;
                console.log('Updated personal list count to:', totalItems, 'from data:', watchlistData);
                
                // Re-render the list selector to show updated counts
                renderListSelector();
            }
        } else {
            console.log('Not updating personal list count - viewing custom lists');
        }
    } else {
        console.log('No watchlist data available for count update');
    }
}

async function importFullSeries(imdbId) {
    try {
        const response = await fetch(`${API_BASE}/import/series/${imdbId}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            showSuccess('Series imported successfully!');
            
            // Clear search results
            document.getElementById('searchResultsMovies').innerHTML = '';
            document.getElementById('searchResultsSeries').innerHTML = '';
            // Clear smart omnibox search results
            clearSmartOmniboxSearch();
            
            // Only show list selection dialog if multiple lists are currently visible
            const visibleLists = userLists.filter(list => selectedListIds.includes(list.id));
            if (visibleLists.length > 1) {
                const selectedLists = await showImportListSelectionDialog(data.title || 'Series', 'series', data.id || data.series_id);
                if (selectedLists.length > 0) {
                    await addSeriesToSelectedLists(data.id || data.series_id, data.title || 'Series', selectedLists);
                }
            } else {
                // If only one list is showing, add directly to that list
                const targetList = visibleLists.length === 1 ? visibleLists[0].id : 'personal';
                await addSeriesToSelectedLists(data.id || data.series_id, data.title || 'Series', [targetList]);
            }
            
            // Reload the appropriate watchlist (personal or custom lists)
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

async function importItemWithSequels(imdbId) {
    try {
        const response = await fetch(`${API_BASE}/import/movie/${imdbId}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            console.log('🎬 Import response data:', data);
            showSuccess('Movie imported successfully!');
            
            // Clear search results
            document.getElementById('searchResultsMovies').innerHTML = '';
            document.getElementById('searchResultsSeries').innerHTML = '';
            // Clear smart omnibox search results
            clearSmartOmniboxSearch();
            
            // Only show list selection dialog if multiple lists are currently visible
            const visibleLists = userLists.filter(list => selectedListIds.includes(list.id));
            if (visibleLists.length > 1) {
                const selectedLists = await showImportListSelectionDialog(data.title || 'Movie', 'movie', data.id || data.movie_id);
                if (selectedLists.length > 0) {
                    await addMovieToSelectedLists(data.id || data.movie_id, data.title || 'Movie', selectedLists);
                }
            } else {
                // If only one list is showing, add directly to that list
                const targetList = visibleLists.length === 1 ? visibleLists[0].id : 'personal';
                console.log('🎯 Single list import - Target list:', targetList, 'Visible lists:', visibleLists);
                await addMovieToSelectedLists(data.id || data.movie_id, data.title || 'Movie', [targetList]);
            }
            
            // Reload the appropriate watchlist (personal or custom lists)
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Import failed: ' + (error.detail || 'Unknown error'));
        }
    } catch (e) {
        showError('Import failed: ' + (e.message || e));
    }
}

// Add series to selected custom lists
async function addSeriesToSelectedLists(seriesId, seriesTitle, targetLists = null) {
    try {
        const listsToAddTo = targetLists || selectedListIds.filter(id => id !== 'personal');
        
        for (const listId of listsToAddTo) {
            if (listId === 'personal') continue; // Skip personal list
            
            const response = await fetch(`${API_BASE}/lists/${listId}/items`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    item_type: 'series',
                    item_id: seriesId,
                    notes: `Imported from search on ${new Date().toLocaleDateString()}`
                })
            });
            
            if (response.ok) {
                console.log(`Added series "${seriesTitle}" to list ${listId}`);
            } else {
                console.error(`Failed to add series to list ${listId}:`, response.status);
            }
        }
        
        // Refresh the list data
        await loadUserLists();
        renderListSelector();
        
    } catch (error) {
        console.error('Error adding series to lists:', error);
    }
}

// Add movie to selected custom lists
async function addMovieToSelectedLists(movieId, movieTitle, targetLists = null) {
    try {
        const listsToAddTo = targetLists || selectedListIds.filter(id => id !== 'personal');
        console.log('🎬 Adding movie to lists:', { movieId, movieTitle, targetLists, listsToAddTo });
        
        for (const listId of listsToAddTo) {
            if (listId === 'personal') {
                console.log('⏭️ Skipping personal list');
                continue; // Skip personal list
            }
            
            const response = await fetch(`${API_BASE}/lists/${listId}/items`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    item_type: 'movie',
                    item_id: movieId,
                    notes: `Imported from search on ${new Date().toLocaleDateString()}`
                })
            });
            
            if (response.ok) {
                console.log(`Added movie "${movieTitle}" to list ${listId}`);
            } else {
                console.error(`Failed to add movie to list ${listId}:`, response.status);
            }
        }
        
        // Refresh the list data
        await loadUserLists();
        renderListSelector();
        
    } catch (error) {
        console.error('Error adding movie to lists:', error);
    }
}

// Show list management overlay
function showListManagementOverlay() {
    console.log('showListManagementOverlay called');
    
    // Ensure DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => showListManagementOverlay());
        return;
    }
    
    const overlay = document.getElementById('listManagementOverlay');
    console.log('Overlay element:', overlay);
    if (overlay) {
        overlay.style.display = 'flex';
        console.log('Overlay displayed, calling renderListManagementContent');
        renderListManagementContent();
    } else {
        console.error('listManagementOverlay element not found');
    }
}

// Close list management overlay
function closeListManagementOverlay() {
    const overlay = document.getElementById('listManagementOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Switch between list management tabs
function switchListTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the clicked button
    const clickedButton = document.querySelector(`[onclick*="switchListTab('${tabName}')"]`);
    if (clickedButton) {
        clickedButton.classList.add('active');
    }
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    let targetTab;
    if (tabName === 'all') {
        targetTab = document.getElementById('allListsTab');
    } else if (tabName === 'shared') {
        targetTab = document.getElementById('sharedListsTab');
    } else if (tabName === 'settings') {
        targetTab = document.getElementById('settingsTab');
    }
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Render content for the selected tab
    if (tabName === 'all') {
        renderListManagementContent();
    } else if (tabName === 'shared') {
        renderSharedListsContent();
    } else if (tabName === 'settings') {
        renderListSettingsContent();
    }
}

// Render the list management content
function renderListManagementContent() {
    const listsGrid = document.getElementById('listsGrid');
    if (!listsGrid) return;
    
    listsGrid.innerHTML = '';
    
    userLists.forEach(list => {
        const listCard = createListCard(list);
        listsGrid.appendChild(listCard);
    });
}

// Create a list card for the management overlay
function createListCard(list) {
    const card = document.createElement('div');
    card.className = 'list-card';
    
    const isPersonal = list.id === 'personal';
    const isSelected = selectedListIds.includes(list.id);
    
    card.innerHTML = `
        <div class="list-card-header">
            <div class="list-card-icon" style="color: ${list.color || '#007AFF'}">
                ${list.icon || '📋'}
            </div>
            <div class="list-card-info">
                <h4 class="list-card-name">${list.name}</h4>
                <p class="list-card-meta">${list.type === 'personal' ? 'Personal Watchlist' : 'Custom List'}</p>
            </div>
        </div>
        
        <div class="list-card-description">
            ${list.description || (isPersonal ? 'Your main watchlist with all imported content' : 'No description provided')}
        </div>
        
        <div class="list-card-stats">
            <div class="list-stat">
                <span class="list-stat-value">${list.item_count || 0}</span>
                <span class="list-stat-label">Items</span>
            </div>
            <div class="list-stat">
                <span class="list-stat-value">${isSelected ? '✓' : '○'}</span>
                <span class="list-stat-label">Selected</span>
            </div>
            <div class="list-stat">
                <span class="list-stat-value">${list.is_active ? '🟢' : '🔴'}</span>
                <span class="list-stat-label">Status</span>
            </div>
        </div>
        
        <div class="list-card-actions">
            ${!isPersonal ? `
                <button class="list-action-btn primary" onclick="editList(${list.id})">
                    ✏️ Edit
                </button>
                <button class="list-action-btn" onclick="toggleListSelection('${list.id}')">
                    ${isSelected ? '👁️ Hide' : '👁️ Show'}
                </button>
                <button class="list-action-btn" onclick="shareList(${list.id})">
                    🔗 Share
                </button>
                <button class="list-action-btn danger" onclick="deleteList(${list.id})">
                    🗑️ Delete
                </button>
            ` : `
                <button class="list-action-btn primary" onclick="toggleListSelection('${list.id}')">
                    ${isSelected ? '👁️ Hide' : '👁️ Show'}
                </button>
                <button class="list-action-btn" onclick="viewListItems('${list.id}')">
                    📋 View Items
                </button>
            `}
        </div>
    `;
    
    return card;
}

// Render shared lists content
function renderSharedListsContent() {
    const sharedListsTab = document.getElementById('sharedListsTab');
    
    // Filter for shared lists
    const sharedLists = userLists.filter(list => list.type === 'shared');
    
    if (sharedLists.length === 0) {
        sharedListsTab.innerHTML = `
            <div class="shared-lists-info">
                <h4 style="color: #e0e0e0; margin-bottom: 16px;">📤 No Shared Lists</h4>
                <p>No lists have been shared with you yet.</p>
                <p>When someone shares a list with you, it will appear here.</p>
                <div style="margin-top: 24px;">
                    <p style="color: rgba(255, 255, 255, 0.6); font-size: 0.9em;">
                        💡 Tip: Ask friends to share their lists by entering your username: <strong style="color: #00d4aa;">${window.currentUser?.username || 'your-username'}</strong>
                    </p>
                </div>
            </div>
        `;
        return;
    }
    
    sharedListsTab.innerHTML = `
        <div class="lists-grid" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
            ${sharedLists.map(list => createSharedListCard(list)).join('')}
        </div>
    `;
}

// Create a shared list card
function createSharedListCard(list) {
    const card = document.createElement('div');
    card.className = 'list-card';
    
    const isSelected = selectedListIds.includes(list.id);
    
    card.innerHTML = `
        <div class="list-card-header">
            <div class="list-card-icon" style="color: ${list.color || '#007AFF'}">
                ${list.icon || '🔗'}
            </div>
            <div class="list-card-info">
                <h4 class="list-card-name">${list.name}</h4>
                <p class="list-card-meta">Shared by ${list.owner || 'Unknown'}</p>
            </div>
        </div>
        
        <div class="list-card-description">
            ${list.description || 'No description provided'}
        </div>
        
        <div class="list-card-stats">
            <div class="list-stat">
                <span class="list-stat-value">${list.item_count || 0}</span>
                <span class="list-stat-label">Items</span>
            </div>
            <div class="list-stat">
                <span class="list-stat-value">${isSelected ? '✓' : '○'}</span>
                <span class="list-stat-label">Selected</span>
            </div>
            <div class="list-stat">
                <span class="list-stat-value">🔗</span>
                <span class="list-stat-label">Shared</span>
            </div>
        </div>
        
        <div class="list-card-actions">
            <button class="list-action-btn primary" onclick="toggleListSelection('${list.id}')">
                ${isSelected ? '👁️ Hide' : '👁️ Show'}
            </button>
            <button class="list-action-btn" onclick="viewListItems('${list.id}')">
                📋 View Items
            </button>
            ${list.permission === 'edit' ? `
                <button class="list-action-btn" onclick="addItemToSharedList('${list.id}')">
                    ➕ Add Items
                </button>
            ` : ''}
            <button class="list-action-btn danger" onclick="unshareList('${list.id}')">
                🚫 Remove
            </button>
        </div>
    `;
    
    return card.outerHTML;
}

// Render list settings content
function renderListSettingsContent() {
    const settingsTab = document.getElementById('settingsTab');
    if (!settingsTab) return;
    
    settingsTab.innerHTML = `
        <div class="list-settings-content">
            <h4 style="color: #e0e0e0; margin-bottom: 16px;">⚙️ List Settings</h4>
            
            <div class="settings-section">
                <h5 style="color: #00d4aa; margin-bottom: 12px;">Default List Behavior</h5>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="autoAddToPersonal" checked disabled>
                        <span class="setting-text">Always add imported items to Personal Watchlist</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="rememberLastUsedLists">
                        <span class="setting-text">Remember last used lists for next import</span>
                    </label>
                </div>
            </div>
            
            <div class="settings-section">
                <h5 style="color: #00d4aa; margin-bottom: 12px;">List Management</h5>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="confirmListDeletion" checked>
                        <span class="setting-text">Confirm before deleting lists</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="showListCounts" checked>
                        <span class="setting-text">Show item counts in list selector</span>
                    </label>
                </div>
            </div>
            
            <div class="settings-section">
                <h5 style="color: #00d4aa; margin-bottom: 12px;">Import Behavior</h5>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="autoSelectNewLists">
                        <span class="setting-text">Automatically select newly created lists</span>
                    </label>
                </div>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="showImportSummary" checked>
                        <span class="setting-text">Show detailed import summary</span>
                    </label>
                </div>
            </div>
        </div>
    `;
}

// Edit a list
function editList(listId) {
    const list = userLists.find(l => l.id === listId);
    if (!list) return;
    
    // Populate edit modal
    document.getElementById('editListNameInput').value = list.name;
    document.getElementById('editListDescriptionInput').value = list.description || '';
    
    // Set selected icon and color
    selectedIcon = list.icon || '📋';
    selectedColor = list.color || '#007AFF';
    
    // Populate icon and color selectors
    populateEditSelectors();
    
    // Show edit modal
    document.getElementById('editListModal').style.display = 'flex';
    
    // Store the list being edited
    window.editingListId = listId;
}

// Populate edit selectors with current values
function populateEditSelectors() {
    // Populate icon selector
    const iconSelector = document.getElementById('editIconSelector');
    iconSelector.innerHTML = '';
    
    const icons = ['📋', '🎬', '⭐', '❤️', '🔥', '🎭', '🚀', '💎', '🌟', '🎪'];
    icons.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `icon-option ${icon === selectedIcon ? 'selected' : ''}`;
        btn.dataset.icon = icon;
        btn.onclick = () => selectEditIcon(icon);
        btn.textContent = icon;
        iconSelector.appendChild(btn);
    });
    
    // Populate color selector
    const colorSelector = document.getElementById('editColorSelector');
    colorSelector.innerHTML = '';
    
    const colors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FF2D92', '#5AC8FA', '#FFCC02'];
    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `color-option ${color === selectedColor ? 'selected' : ''}`;
        btn.dataset.color = color;
        btn.onclick = () => selectEditColor(color);
        btn.style.backgroundColor = color;
        colorSelector.appendChild(btn);
    });
}

// Select icon in edit modal
function selectEditIcon(icon) {
    selectedIcon = icon;
    document.querySelectorAll('#editIconSelector .icon-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.icon === icon) {
            btn.classList.add('selected');
        }
    });
}

// Select color in edit modal
function selectEditColor(color) {
    selectedColor = color;
    document.querySelectorAll('#editColorSelector .color-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.color === color) {
            btn.classList.add('selected');
        }
    });
}

// Save list changes
async function saveListChanges() {
    const listId = window.editingListId;
    if (!listId) return;
    
    const name = document.getElementById('editListNameInput').value.trim();
    const description = document.getElementById('editListDescriptionInput').value.trim();
    
    if (!name) {
        alert('Please enter a list name');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/lists/${listId}`, {
            method: 'PUT',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: description,
                color: selectedColor,
                icon: selectedIcon
            })
        });
        
        if (response.ok) {
            showSuccess('List updated successfully!');
            closeEditListModal();
            
            // Refresh lists and UI
            await loadUserLists();
            renderListSelector();
            renderListManagementContent();
        } else {
            const error = await response.json();
            showError('Failed to update list: ' + (error.detail || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating list:', error);
        showError('Failed to update list: ' + error.message);
    }
}

// Close edit list modal
function closeEditListModal() {
    document.getElementById('editListModal').style.display = 'none';
    window.editingListId = null;
}

// Share a list
function shareList(listId) {
    console.log('🔗 Share list called for listId:', listId);
    
    // Find the list details
    const list = userLists.find(l => l.id == listId);
    if (!list) {
        showError('List not found');
        return;
    }
    
    // Create share modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>🔗 Share "${list.name}"</h3>
            <p class="modal-subtitle">Share this list with another user</p>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label for="shareUsername">Username to share with:</label>
                <input type="text" id="shareUsername" placeholder="Enter username" style="
                    width: 100%;
                    padding: 16px 18px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.08);
                    color: #ffffff;
                    font-size: 1em;
                    margin-top: 8px;
                    box-sizing: border-box;
                ">
                <div class="input-hint">Enter the exact username of the person you want to share with</div>
            </div>
            
            <div class="form-group" style="margin-top: 24px;">
                <label>Permission Level:</label>
                <div style="margin-top: 12px;">
                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 12px;
                        cursor: pointer;
                        color: #e0e0e0;
                        font-size: 0.95em;
                    ">
                        <input type="radio" name="sharePermission" value="view" checked style="
                            width: 18px;
                            height: 18px;
                            accent-color: #00d4aa;
                        ">
                        <div>
                            <strong>View Only</strong>
                            <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6);">
                                Can see the list and its items, but cannot make changes
                            </div>
                        </div>
                    </label>
                    
                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        cursor: pointer;
                        color: #e0e0e0;
                        font-size: 0.95em;
                    ">
                        <input type="radio" name="sharePermission" value="edit" style="
                            width: 18px;
                            height: 18px;
                            accent-color: #00d4aa;
                        ">
                        <div>
                            <strong>Edit Access</strong>
                            <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6);">
                                Can add, remove, and modify items in the list
                            </div>
                        </div>
                    </label>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button class="btn btn-secondary" onclick="closeShareModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmShareList(${listId})">Share List</button>
        </div>
    `;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Store modal reference for cleanup
    window.currentShareModal = modalOverlay;
    
    // Focus the username input
    setTimeout(() => {
        const usernameInput = document.getElementById('shareUsername');
        if (usernameInput) {
            usernameInput.focus();
        }
    }, 100);
    
    // Close on backdrop click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeShareModal();
        }
    });
}

// Close share modal
function closeShareModal() {
    if (window.currentShareModal) {
        document.body.removeChild(window.currentShareModal);
        window.currentShareModal = null;
    }
}

// Confirm list sharing
async function confirmShareList(listId) {
    const usernameInput = document.getElementById('shareUsername');
    const selectedPermission = document.querySelector('input[name="sharePermission"]:checked');
    
    if (!usernameInput || !selectedPermission) {
        showError('Please fill in all fields');
        return;
    }
    
    const username = usernameInput.value.trim();
    const permission = selectedPermission.value;
    
    if (!username) {
        showError('Please enter a username');
        usernameInput.focus();
        return;
    }
    
    console.log('🔗 Sharing list', listId, 'with user', username, 'permission:', permission);
    
    try {
        const response = await fetch(`${API_BASE}/lists/${listId}/share`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                permission: permission
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showSuccess(`List shared successfully with ${username}!`);
            closeShareModal();
            
            // Refresh the lists to show updated sharing status
            await loadUserLists();
        } else {
            const error = await response.json();
            showError('Failed to share list: ' + (error.detail || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sharing list:', error);
        showError('Failed to share list: ' + error.message);
    }
}

// Remove shared list access (unshare)
async function unshareList(listId) {
    if (!confirm('Are you sure you want to remove access to this shared list?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/lists/${listId}/unshare`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showSuccess('Shared list access removed');
            
            // Remove from UI immediately
            await loadUserLists();
            renderSharedListsContent();
        } else {
            const error = await response.json();
            showError('Failed to remove shared list: ' + (error.detail || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error removing shared list:', error);
        showError('Failed to remove shared list: ' + error.message);
    }
}

// Delete a list
async function deleteList(listId) {
    if (!confirm('Are you sure you want to delete this list? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/lists/${listId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showSuccess('List deleted successfully!');
            
            // Remove from selected lists if it was selected
            const index = selectedListIds.indexOf(listId);
            if (index > -1) {
                selectedListIds.splice(index, 1);
                if (selectedListIds.length === 0) {
                    selectedListIds.push('personal');
                }
            }
            
            // Refresh lists and UI
            await loadUserLists();
            renderListSelector();
            renderListManagementContent();
            loadWatchlist();
        } else {
            const error = await response.json();
            showError('Failed to delete list: ' + (error.detail || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting list:', error);
        showError('Failed to delete list: ' + error.message);
    }
}

// View list items
function viewListItems(listId) {
    // Select the list and close the overlay
    selectedListIds = [listId];
    renderListSelector();
    closeListManagementOverlay();
    loadWatchlist();
}

// Show dialog for selecting which lists to add imported items to
function showImportListSelectionDialog(itemTitle, itemType, itemId) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.style.display = 'flex';
    
    const availableLists = userLists.filter(list => list.id !== 'personal');
    
    if (availableLists.length === 0) {
        // No custom lists, just add to personal watchlist
        return Promise.resolve(['personal']);
    }
    
    return new Promise((resolve) => {
        dialog.innerHTML = `
            <div class="modal import-selection-modal">
                <div class="modal-header">
                    <h3>📥 Add to Lists</h3>
                    <p class="modal-subtitle">Choose which lists to add "${itemTitle}" to</p>
                </div>
                <div class="modal-body">
                    <div class="list-selection-options">
                        <div class="option-group personal-option">
                            <label class="option-label personal-label">
                                <input type="checkbox" id="addToPersonal" checked disabled>
                                <span class="option-text">📱 My Watchlist (always added)</span>
                                <span class="option-description">This item will always be added to your main watchlist</span>
                            </label>
                        </div>
                        
                        <div class="option-group bulk-option">
                            <label class="option-label bulk-label">
                                <input type="checkbox" id="addToAllCustom">
                                <span class="option-text">📋 Add to all custom lists</span>
                                <span class="option-description">Quickly add to all your custom lists at once</span>
                            </label>
                        </div>
                        
                        <div class="custom-lists-section">
                            <h4>🎯 Or select specific lists:</h4>
                            <div class="custom-lists-grid">
                                ${availableLists.map(list => `
                                    <label class="list-option">
                                        <input type="checkbox" class="custom-list-checkbox" data-list-id="${list.id}">
                                        <div class="list-option-content">
                                            <span class="list-option-icon" style="color: ${list.color || '#007AFF'}">${list.icon || '📋'}</span>
                                            <span class="list-option-name">${list.name}</span>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="closeImportSelectionDialog()">Cancel</button>
                    <button class="btn btn-primary gradient-btn" onclick="confirmImportSelection('${itemType}', ${itemId})">Add to Selected Lists</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Add event listeners
        const addToAllCustom = document.getElementById('addToAllCustom');
        const customListCheckboxes = document.querySelectorAll('.custom-list-checkbox');
        
        addToAllCustom.addEventListener('change', function() {
            customListCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
        
        // Store the resolve function for later use
        window.importSelectionResolve = resolve;
    });
}

// Close import selection dialog
function closeImportSelectionDialog() {
    const dialog = document.querySelector('.import-selection-modal').closest('.modal-overlay');
    if (dialog) {
        dialog.remove();
    }
    if (window.importSelectionResolve) {
        window.importSelectionResolve([]);
        window.importSelectionResolve = null;
    }
}

// Confirm import selection and add items to selected lists
async function confirmImportSelection(itemType, itemId) {
    const selectedLists = ['personal']; // Always add to personal
    
    // Check if "add to all" is selected
    const addToAllCustom = document.getElementById('addToAllCustom');
    if (addToAllCustom.checked) {
        // Add to all custom lists
        userLists.forEach(list => {
            if (list.id !== 'personal') {
                selectedLists.push(list.id);
            }
        });
    } else {
        // Add to specifically selected custom lists
        const customListCheckboxes = document.querySelectorAll('.custom-list-checkbox:checked');
        customListCheckboxes.forEach(checkbox => {
            selectedLists.push(checkbox.dataset.listId);
        });
    }
    
    // Close dialog
    closeImportSelectionDialog();
    
    // Resolve with selected lists
    if (window.importSelectionResolve) {
        window.importSelectionResolve(selectedLists);
        window.importSelectionResolve = null;
    }
}

// Select background color for list
function selectBackgroundColor(color, event) {
    // Remove selected class from all background color options
    document.querySelectorAll('.bg-color-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Add selected class to clicked option
    event.target.classList.add('selected');
    
    // Store selected background color
    window.selectedBackgroundColor = color;
    
    console.log('Selected background color:', color);
}

// Progress modal functions for long-running operations
function showProgressModalWithProgress(title, message, totalWork) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${title}</h3>
            <p class="modal-subtitle">${message}</p>
        </div>
        <div class="modal-body">
            <div style="text-align: center; padding: 20px;">
                <div id="progress-phase" style="color: rgba(255, 255, 255, 0.9); margin: 0 0 15px 0; font-weight: 500;">
                    Starting import...
                </div>
                
                <!-- Real Progress Bar -->
                <div style="margin: 20px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255, 255, 255, 0.7); font-size: 14px;">Progress</span>
                        <span id="progress-percentage" style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">0%</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        overflow: hidden;
                    ">
                        <div id="progress-bar-fill" style="
                            width: 0%;
                            height: 100%;
                            background: linear-gradient(90deg, #00d4aa, #00b8d4);
                            border-radius: 4px;
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                    <div id="progress-details" style="color: rgba(255, 255, 255, 0.6); margin-top: 8px; font-size: 12px;">
                        Processing movies...
                    </div>
                </div>
                
                <div id="progress-tips" style="color: rgba(255, 255, 255, 0.6); margin: 0; font-size: 12px; font-style: italic;">
                    💡 Tip: Large libraries are processed in batches for efficiency
                </div>
            </div>
        </div>
    `;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Store progress tracking elements
    modalOverlay.progressElements = {
        phase: modal.querySelector('#progress-phase'),
        percentage: modal.querySelector('#progress-percentage'),
        barFill: modal.querySelector('#progress-bar-fill'),
        details: modal.querySelector('#progress-details'),
        tips: modal.querySelector('#progress-tips')
    };
    
    // Initialize progress
    modalOverlay.currentProgress = 0;
    modalOverlay.totalWork = totalWork;
    
    return modalOverlay;
}

// Function to start smart, data-driven progress animation
function startPredictiveProgress(modalOverlay, totalWork) {
    if (!modalOverlay || !modalOverlay.progressElements) return;
    
    // Use pre-scan data for better timing if available
    let totalTime, target95Percent, target100Percent;
    
    if (modalOverlay.preScanData) {
        // Calculate smart timing based on pre-scan data
        const movies = modalOverlay.preScanData.total_movies;
        const collections = modalOverlay.preScanData.estimated_collections;
        
        // Base timing: 0.15s per movie + 0.8s per collection
        totalTime = Math.max(3, (movies * 0.15) + (collections * 0.8));
        target95Percent = totalTime * 0.95;
        target100Percent = totalTime * 1.1; // 10% buffer
    } else {
        // Fallback to simple timing
        totalTime = Math.max(3, totalWork * 0.15);
        target95Percent = totalTime * 0.95;
        target100Percent = totalTime * 1.1;
    }
    
    console.log(`🚀 Starting smart progress: ${totalWork} items, ~${totalTime.toFixed(1)}s total, 95% at ${target95Percent.toFixed(1)}s`);
    
    let startTime = Date.now();
    
    const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        
        // Smart progression: reach 95% at target time, then slow down
        let progress;
        if (elapsed <= target95Percent) {
            // Linear progression to 95%
            progress = (elapsed / target95Percent) * 95;
        } else {
            // Slow progression from 95% to 100%
            const remainingTime = target100Percent - target95Percent;
            const elapsedAfter95 = elapsed - target95Percent;
            const progressAfter95 = Math.min(5, (elapsedAfter95 / remainingTime) * 5);
            progress = 95 + progressAfter95;
        }
        
        progress = Math.min(98, progress); // Cap at 98% until actual completion
        
        const currentPhase = getPhaseForProgress(progress);
        updateProgress(modalOverlay, Math.floor(progress * totalWork / 100), totalWork, currentPhase, 'Processing...');
        
        if (progress >= 98) {
            clearInterval(progressInterval);
        }
    }, 200); // Update every 200ms for smooth animation
    
    modalOverlay.progressInterval = progressInterval;
}

// Function to get appropriate phase text based on progress percentage
function getPhaseForProgress(progress) {
    if (progress < 25) return 'Processing movies...';
    if (progress < 50) return 'Processing movies...';
    if (progress < 75) return 'Checking collections...';
    if (progress < 90) return 'Importing sequels...';
    return 'Finalizing...';
}

// Function to update progress in the progress modal
function updateProgress(modalOverlay, current, total, phase, details) {
    if (!modalOverlay || !modalOverlay.progressElements) return;
    
    const percentage = Math.min(100, Math.round((current / total) * 100));
    
    modalOverlay.progressElements.percentage.textContent = `${percentage}%`;
    modalOverlay.progressElements.barFill.style.width = `${percentage}%`;
    
    if (phase) {
        modalOverlay.progressElements.phase.textContent = phase;
    }
    
    if (details) {
        modalOverlay.progressElements.details.textContent = details;
    }
    
    // Update tips based on progress
    if (percentage < 25) {
        modalOverlay.progressElements.tips.textContent = '💡 Tip: Large libraries are processed in batches for efficiency';
    } else if (percentage < 50) {
        modalOverlay.progressElements.tips.textContent = '💡 Tip: Collection detection uses TMDB API for accuracy';
    } else if (percentage < 75) {
        modalOverlay.progressElements.tips.textContent = '💡 Tip: This step may take longer for large collections';
    } else {
        modalOverlay.progressElements.tips.textContent = '💡 Tip: Almost done! Your watchlist will refresh automatically';
    }
}

function showProgressModal(title, message) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${title}</h3>
            <p class="modal-subtitle">${message}</p>
        </div>
        <div class="modal-body">
            <div style="text-align: center; padding: 20px;">
                <div class="spinner" style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(0, 212, 170, 0.3);
                    border-top: 4px solid #00d4aa;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <div id="progress-phase" style="color: rgba(255, 255, 255, 0.9); margin: 0 0 10px 0; font-weight: 500;">
                    Starting import...
                </div>
                <div id="progress-details" style="color: rgba(255, 255, 255, 0.7); margin: 0 0 15px 0; font-size: 14px;">
                    This may take several minutes for large libraries
                </div>
                <div id="progress-tips" style="color: rgba(255, 255, 255, 0.6); margin: 0; font-size: 12px; font-style: italic;">
                    💡 Tip: Large libraries are processed in batches for efficiency
                </div>
            </div>
        </div>
    `;
    
    // Add CSS animation for spinner
    if (!document.querySelector('#spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'spinner-styles';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Start progress simulation for better UX
    startProgressSimulation(modalOverlay);
    
    return modalOverlay;
}

function startProgressSimulation(modalOverlay) {
    const phaseElement = modalOverlay.querySelector('#progress-phase');
    const detailsElement = modalOverlay.querySelector('#progress-details');
    const tipsElement = modalOverlay.querySelector('#progress-tips');
    
    const phases = [
        { phase: "Fetching Jellyfin library...", details: "Retrieving movie list from your server", tip: "💡 This step depends on your Jellyfin server response time" },
        { phase: "Processing movies...", details: "Importing movies in batches of 10", tip: "💡 Batching improves performance and prevents timeouts" },
        { phase: "Checking collections...", details: "Identifying movies that belong to franchises", tip: "💡 Collection detection uses TMDB API for accuracy" },
        { phase: "Importing sequels...", details: "Adding missing franchise movies", tip: "💡 This step may take longer for large collections" },
        { phase: "Finalizing import...", details: "Completing database updates", tip: "💡 Almost done! Your watchlist will refresh automatically" }
    ];
    
    let currentPhase = 0;
    let phaseStartTime = Date.now();
    
    const updateProgress = () => {
        if (!modalOverlay.parentNode) return; // Modal was closed
        
        const now = Date.now();
        const timeInPhase = now - phaseStartTime;
        
        // Show current phase
        phaseElement.textContent = phases[currentPhase].phase;
        detailsElement.textContent = phases[currentPhase].details;
        tipsElement.textContent = phases[currentPhase].tip;
        
        // Progress to next phase after some time
        if (timeInPhase > 8000) { // 8 seconds per phase
            currentPhase = Math.min(currentPhase + 1, phases.length - 1);
            phaseStartTime = now;
        }
        
        // Continue updating
        setTimeout(updateProgress, 2000);
    };
    
    // Start the progress simulation
    setTimeout(updateProgress, 1000);
}

function closeProgressModal(modalOverlay) {
    if (modalOverlay && modalOverlay.parentNode) {
        // Clear any progress polling intervals
        if (modalOverlay.progressInterval) {
            clearInterval(modalOverlay.progressInterval);
        }
        modalOverlay.parentNode.removeChild(modalOverlay);
    }
}

// Custom confirmation modal to replace browser confirm() dialogs
function showCustomConfirmModal(title, message) {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'flex';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.maxWidth = '500px';
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3>${title}</h3>
                <p class="modal-subtitle">${message}</p>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 20px;">
                    <p style="color: rgba(255, 255, 255, 0.8); margin: 0;">
                        Please confirm this action to continue.
                    </p>
                </div>
            </div>
            <div class="modal-buttons">
                <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
                <button class="btn btn-primary" id="confirm-ok">OK</button>
            </div>
        `;
        
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        
        // Handle button clicks
        modal.querySelector('#confirm-cancel').addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
            resolve(false);
        });
        
        modal.querySelector('#confirm-ok').addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
            resolve(true);
        });
        
        // Handle overlay click to cancel
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                document.body.removeChild(modalOverlay);
                resolve(false);
            }
        });
    });
}// Force rebuild Thu Sep  4 16:07:12 EDT 2025
