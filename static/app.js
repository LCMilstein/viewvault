const API_BASE = '/api';

// Handle Auth0 callback token - must run BEFORE any authentication checks
function handleAuth0Callback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        console.log('🔍 AUTH0 CALLBACK: Token received from URL, storing in localStorage');
        localStorage.setItem('access_token', token);
        
        // Remove token from URL to clean up
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        
        // Don't reload - just continue with normal page load
        console.log('🔍 AUTH0 CALLBACK: Token stored, continuing with page load');
        return true; // Indicate we have a token
    }
    return false; // No token found
}

// Check for Auth0 callback token immediately when script loads
const hasAuth0Token = handleAuth0Callback();

// Set a flag to indicate we just received an Auth0 token
if (hasAuth0Token) {
    window.justReceivedAuth0Token = true;
}

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
        // Don't redirect if we just received an Auth0 token
        if (window.justReceivedAuth0Token) {
            console.log('🔍 AUTH0 CALLBACK: Just received Auth0 token, should be stored');
            // Clear the flag
            window.justReceivedAuth0Token = false;
            // Check again for the token
            const retryToken = localStorage.getItem('access_token');
            if (retryToken) {
                console.log('🔍 AUTH0 CALLBACK: Token found, continuing');
                return true;
            }
        }
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
        
        // Check if this is an Auth0 user BEFORE clearing the token
        const token = localStorage.getItem('access_token');
        let isAuth0User = false;
        
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.auth_provider === 'auth0' || payload.auth_provider === 'both') {
                    isAuth0User = true;
                }
            } catch (e) {
                console.log('Could not parse token for logout detection');
            }
        }
        
        // Clear localStorage
        localStorage.removeItem('access_token');
        
        // Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Handle logout based on auth provider
        if (isAuth0User) {
            // Redirect to Auth0 logout endpoint to clear Auth0 session
            const auth0Domain = 'dev-a6z1zwjm1wj3xpjg.us.auth0.com';
            const clientId = '6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw';
            const returnTo = encodeURIComponent(window.location.origin + '/login?logout=true');
            window.location.href = `https://${auth0Domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;
        } else {
            // Direct redirect to login page for non-Auth0 users
            window.location.href = '/login?logout=true';
        }
        
    } catch (error) {
        console.error('Error during logout:', error);
        // Fallback: clear token and redirect to login
        localStorage.removeItem('access_token');
        window.location.href = '/login?logout=true';
    }
}

// Clean Account Settings modal for Google OAuth users
async function openAccountModal() {
    // Get current user account info
    let accountInfo = null;
    try {
        const response = await fetch('/api/auth/account-info', {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            accountInfo = await response.json();
        }
    } catch (error) {
        console.error('Failed to get account info:', error);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    // Helper function to format dates
    function formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    // Build account info display
    const accountInfoHtml = accountInfo ? `
        <div class="account-info-section">
            <h4>Account Information</h4>
            <div class="info-row">
                <span class="info-label">Username:</span>
                <span class="info-value">${accountInfo.username}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">${accountInfo.email || 'Not set'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Full Name:</span>
                <span class="info-value">${accountInfo.full_name || 'Not set'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Authentication:</span>
                <span class="info-value">Google OAuth</span>
            </div>
            <div class="info-row">
                <span class="info-label">Email Verified:</span>
                <span class="info-value">${accountInfo.email_verified ? '✅ Yes' : '❌ No'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Account Created:</span>
                <span class="info-value">${formatDate(accountInfo.created_at)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Last Login:</span>
                <span class="info-value">${formatDate(accountInfo.last_login)}</span>
            </div>
        </div>
    ` : '';

    // Build danger zone section
    const dangerZoneHtml = `
        <div class="danger-zone-section">
            <h4>Danger Zone</h4>
            <div class="danger-item">
                <div class="danger-info">
                    <h5>Delete My Account</h5>
                    <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
                </div>
                <button class="btn btn-danger" id="deleteAccountBtn">Delete Account</button>
            </div>
        </div>
    `;

    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-label="Account Settings" style="max-width: 600px;">
        <div class="modal-header">
            <h3>Account Settings</h3>
            <p class="modal-subtitle">Manage your account information</p>
        </div>
        <div class="modal-body">
            ${accountInfoHtml}
            ${dangerZoneHtml}
        </div>
        <div class="modal-buttons">
            <button class="btn btn-secondary" id="accCancel">Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    
    const close = () => document.body.removeChild(overlay);
    overlay.querySelector('#accCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
    
    // Delete account handler
    const deleteAccountBtn = overlay.querySelector('#deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            // Show confirmation dialog
            const confirmOverlay = document.createElement('div');
            confirmOverlay.className = 'modal-overlay';
            confirmOverlay.innerHTML = `
                <div class="modal" role="dialog" aria-label="Confirm Account Deletion" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>⚠️ Delete Account</h3>
                        <p class="modal-subtitle">This action cannot be undone</p>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to permanently delete your account?</p>
                        <p><strong>This will delete:</strong></p>
                        <ul>
                            <li>Your account and profile</li>
                            <li>All your watchlists and lists</li>
                            <li>All your movies and series</li>
                            <li>All your viewing history and statistics</li>
                        </ul>
                        <p style="color: #ff6b6b; font-weight: bold;">This action cannot be undone!</p>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
                        <button class="btn btn-danger" id="confirmDelete">Delete My Account</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmOverlay);
            
            const closeConfirm = () => document.body.removeChild(confirmOverlay);
            confirmOverlay.querySelector('#confirmCancel').addEventListener('click', closeConfirm);
            confirmOverlay.addEventListener('click', (e)=>{ if(e.target===confirmOverlay) closeConfirm(); });
            
            // Handle actual deletion
            confirmOverlay.querySelector('#confirmDelete').addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/auth/delete-current-user', {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    
                    if (response.ok) {
                        showToast('Account deleted successfully. Redirecting to login...');
                        // Clear local storage and redirect to login
                        localStorage.clear();
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 2000);
                    } else {
                        const error = await response.json();
                        showToast('Failed to delete account: ' + (error.detail || 'Unknown error'));
                    }
                } catch (error) {
                    showToast('Failed to delete account: ' + error.message);
                }
                closeConfirm();
            });
        });
    }
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
        
        // Show warning if token expires in less than 7 days - DISABLED FOR LAUNCH
        // const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        // if (timeUntilExpiration < sevenDaysInMs && timeUntilExpiration > 0) {
        //     const daysLeft = Math.ceil(timeUntilExpiration / (24 * 60 * 60 * 1000));
        //     showWarning(`Your login session will expire in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Please log in again to continue using the app.`);
        // }
        
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

// Undo functionality for move operations
let undoMoveData = null;
let undoTimeout = null;

// Error recovery and retry functionality
const operationCache = {
    lastOperation: null,
    retryCount: 0,
    maxRetries: 3
};

// Log copy/move operations for debugging
function logOperation(operationType, details, result = null, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        operation: operationType,
        details,
        result,
        error: error ? error.message : null
    };
    console.log(`[${timestamp}] ${operationType}:`, logEntry);
    return logEntry;
}

// Determine error type for better user messaging
function categorizeError(error, response = null) {
    // Network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
            type: 'network',
            message: 'Network error. Please check your connection and try again.',
            recoverable: true
        };
    }
    
    // HTTP status-based errors
    if (response) {
        if (response.status === 403) {
            return {
                type: 'permission',
                message: 'You don\'t have permission to perform this action.',
                recoverable: false
            };
        }
        if (response.status === 404) {
            return {
                type: 'data',
                message: 'The requested item or list was not found.',
                recoverable: false
            };
        }
        if (response.status === 409) {
            return {
                type: 'data',
                message: 'This item already exists in the target list.',
                recoverable: false
            };
        }
        if (response.status >= 500) {
            return {
                type: 'server',
                message: 'Server error. Please try again in a moment.',
                recoverable: true
            };
        }
    }
    
    // Default error
    return {
        type: 'unknown',
        message: error.message || 'An unexpected error occurred.',
        recoverable: true
    };
}

// Retry operation with exponential backoff
async function retryOperation(operationDetails) {
    const { type, params } = operationDetails;
    
    // Increment retry count
    operationCache.retryCount++;
    
    // Calculate backoff delay (exponential: 1s, 2s, 4s)
    const backoffDelay = Math.min(1000 * Math.pow(2, operationCache.retryCount - 1), 4000);
    
    console.log(`Retrying operation (attempt ${operationCache.retryCount}/${operationCache.maxRetries}) after ${backoffDelay}ms delay...`);
    
    // Wait for backoff delay
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    
    // Execute the appropriate operation based on type
    try {
        switch (type) {
            case 'copy':
                await executeCopyOperation(
                    params.itemId,
                    params.itemType,
                    params.sourceListId,
                    params.targetListId,
                    params.skipDuplicateCheck
                );
                break;
            case 'move':
                await executeMoveOperation(
                    params.itemId,
                    params.itemType,
                    params.sourceListId,
                    params.targetListId,
                    params.skipDuplicateCheck
                );
                break;
            case 'bulkCopy':
                await executeBulkCopyOperation(params.targetListId);
                break;
            case 'bulkMove':
                await executeBulkMoveOperation(params.targetListId);
                break;
            default:
                throw new Error('Unknown operation type');
        }
        
        // Reset retry count on success
        operationCache.retryCount = 0;
        operationCache.lastOperation = null;
        
    } catch (error) {
        console.error('Retry failed:', error);
        throw error;
    }
}

// Enhanced error display with retry button
function showErrorWithRetry(message, operationDetails = null, errorType = 'unknown') {
    // Create or update error message
    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error error-message';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '20px';
        errorDiv.style.right = '20px';
        errorDiv.style.zIndex = '10000';
        errorDiv.style.maxWidth = '400px';
        document.body.appendChild(errorDiv);
    }
    
    // Clear any existing content
    errorDiv.innerHTML = '';
    
    // Create message container
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.flexDirection = 'column';
    messageContainer.style.gap = '8px';
    
    // Add error type indicator
    const errorTypeIndicator = document.createElement('div');
    errorTypeIndicator.style.fontSize = '12px';
    errorTypeIndicator.style.opacity = '0.8';
    errorTypeIndicator.style.fontWeight = 'bold';
    errorTypeIndicator.textContent = errorType === 'network' ? '🌐 Network Error' :
                                      errorType === 'permission' ? '🔒 Permission Error' :
                                      errorType === 'data' ? '📋 Data Error' :
                                      errorType === 'server' ? '🖥️ Server Error' :
                                      '⚠️ Error';
    messageContainer.appendChild(errorTypeIndicator);
    
    // Add message text
    const messageText = document.createElement('div');
    messageText.textContent = message;
    messageContainer.appendChild(messageText);
    
    // Add retry button if operation is recoverable and we haven't exceeded max retries
    if (operationDetails && operationCache.retryCount < operationCache.maxRetries) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '8px';
        
        const retryButton = document.createElement('button');
        retryButton.textContent = operationCache.retryCount > 0 ? 
            `Retry (${operationCache.retryCount}/${operationCache.maxRetries})` : 
            'Retry';
        retryButton.className = 'btn btn-secondary';
        retryButton.style.padding = '4px 12px';
        retryButton.style.fontSize = '13px';
        retryButton.style.minWidth = 'auto';
        retryButton.style.whiteSpace = 'nowrap';
        retryButton.onclick = async () => {
            errorDiv.style.display = 'none';
            try {
                await retryOperation(operationDetails);
            } catch (retryError) {
                const errorInfo = categorizeError(retryError);
                if (operationCache.retryCount >= operationCache.maxRetries) {
                    showError(`Failed after ${operationCache.maxRetries} attempts. ${errorInfo.message}`);
                    operationCache.retryCount = 0;
                    operationCache.lastOperation = null;
                } else if (errorInfo.recoverable) {
                    showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
                } else {
                    showError(errorInfo.message);
                    operationCache.retryCount = 0;
                    operationCache.lastOperation = null;
                }
            }
        };
        buttonContainer.appendChild(retryButton);
        
        const dismissButton = document.createElement('button');
        dismissButton.textContent = 'Dismiss';
        dismissButton.className = 'btn btn-secondary';
        dismissButton.style.padding = '4px 12px';
        dismissButton.style.fontSize = '13px';
        dismissButton.style.minWidth = 'auto';
        dismissButton.style.whiteSpace = 'nowrap';
        dismissButton.onclick = () => {
            errorDiv.style.display = 'none';
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
        };
        buttonContainer.appendChild(dismissButton);
        
        messageContainer.appendChild(buttonContainer);
    }
    
    errorDiv.appendChild(messageContainer);
    errorDiv.style.display = 'block';
    
    // Auto-hide after 10 seconds (longer for errors with retry)
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 10000);
}

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
            
            // Add event listeners for item menu buttons
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                btn.onclick = function(e) {
                    const itemId = btn.getAttribute('data-item-id');
                    const itemType = btn.getAttribute('data-item-type');
                    const listId = 1; // Default to main watchlist for now
                    openItemMenu(itemId, itemType, listId, e);
                };
            });
            
            // Setup long-press gesture for mobile on watchlist rows
            document.querySelectorAll('.watchlist-row').forEach(row => {
                const menuBtn = row.querySelector('.item-menu-btn');
                if (menuBtn) {
                    const itemId = menuBtn.getAttribute('data-item-id');
                    const itemType = menuBtn.getAttribute('data-item-type');
                    const listId = 1; // Default to main watchlist for now
                    setupLongPressGesture(row, itemId, itemType, listId);
                }
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
        
        // Add event listeners for item menu buttons
        document.querySelectorAll('.item-menu-btn').forEach(btn => {
            btn.onclick = function(e) {
                const itemId = btn.getAttribute('data-item-id');
                const itemType = btn.getAttribute('data-item-type');
                const listId = 1; // Default to main watchlist for now
                openItemMenu(itemId, itemType, listId, e);
            };
        });
        
        // Setup long-press gesture for mobile on watchlist rows
        document.querySelectorAll('.watchlist-row').forEach(row => {
            const menuBtn = row.querySelector('.item-menu-btn');
            if (menuBtn) {
                const itemId = menuBtn.getAttribute('data-item-id');
                const itemType = menuBtn.getAttribute('data-item-type');
                const listId = 1; // Default to main watchlist for now
                setupLongPressGesture(row, itemId, itemType, listId);
            }
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
                console.log('🔍 Found itemData for', type, ':', itemData);
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
        <div class="watchlist-row ${isNewMovie ? 'new-item' : ''}" data-item-id="${movie.id}" data-item-type="movie">
            <input type="checkbox" class="checkbox" data-type="movie" data-id="${movie.id}" ${movie.watched ? 'checked' : ''}>
            <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                                    <div class="title">${movie.title}${newBadgeMovie}${newlyImportedBadge}</div>
            <div class="meta">${qualityBadge}Movie${movie.release_date ? ' • ' + new Date(movie.release_date).getFullYear() : ''} • Part of ${collection.title}</div>
            <button class="item-menu-btn" aria-label="More options for ${movie.title}" aria-haspopup="menu" aria-expanded="false" data-item-id="${movie.id}" data-item-type="movie" style="margin-left:auto;">⋮</button>
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
    
    let html = `<div class="watchlist-row collection-row ${isNew ? 'new-item' : ''}" data-collection-id="${collection.id}" data-item-id="${collection.id}" data-item-type="collection">
        <input type="checkbox" class="${checkboxClass}" data-type="collection" data-id="${collection.id}" ${checkboxState}>
        <div class="clickable-area" data-type="collection" data-id="${collection.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            <img src="${collection.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
            <div class="title">${collection.title}${newBadge}${newlyImportedBadge}</div>
            <div class="meta">Collection (${collection.items.length} movies; ${unwatchedCount} unwatched)</div>
        </div>
        <button class="expand-arrow" aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${collection.title} collection" onclick="toggleCollection('${collection.id}')" style="margin-left: 8px;">${isExpanded ? '▼' : '▶'}</button>
        <button class="item-menu-btn" aria-label="More options for ${collection.title} collection" aria-haspopup="menu" aria-expanded="false" data-item-id="${collection.id}" data-item-type="collection" style="margin-left: 10px;">⋮</button>
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
            
            html += `<div class="watchlist-row ${isNew ? 'new-item' : ''}" data-item-id="${movie.id}" data-item-type="movie">
                <input type="checkbox" class="checkbox" data-type="movie" data-id="${movie.id}" ${movie.watched ? 'checked' : ''}>
                <div class="clickable-area" data-type="movie" data-id="${movie.id}" style="display: flex; align-items: center; flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
                    <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" class="watchlist-thumb" onerror="this.onerror=null;this.src='/static/no-image.png';">
                    <div class="title">${movie.title}${newBadge}${newlyImportedBadge}</div>
                    <div class="meta">${qualityBadge}Movie${movie.release_date ? ' • ' + new Date(movie.release_date).getFullYear() : ''}</div>
                </div>
                <button class="item-menu-btn" aria-label="More options for ${movie.title}" aria-haspopup="menu" aria-expanded="false" data-item-id="${movie.id}" data-item-type="movie" style="margin-left:auto;">⋮</button>
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
        <button class="expand-arrow" aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${series.title} series" onclick="toggleSeries('${series.id}')" style="margin-left: 8px;">${isExpanded ? '▼' : '▶'}</button>
        <button class="item-menu-btn" aria-label="More options for ${series.title} series" aria-haspopup="menu" aria-expanded="false" data-item-id="${series.id}" data-item-type="series" style="margin-left: 10px;">⋮</button>
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
        <button class="item-menu-btn" aria-label="More options for ${movie.title}" aria-haspopup="menu" aria-expanded="false" data-item-id="${movie.id}" data-item-type="movie" style="margin-left: 8px;">⋮</button>
    </div>`;
}

// For episodes, if you want to add a remove icon, add it here. If not supported, gray out or hide the icon.
function renderEpisodeRow(ep, seriesId) {
    const watchedClass = ep.watched ? 'watched-row' : '';
    // Use data attributes instead of inline onchange
    return `<div class="episode-row ${watchedClass}" style="display: flex; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; margin-left: 40px;">
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
                    // Insert episodes as separate rows after the season, not inside it
                    seasonElement.insertAdjacentHTML('afterend', episodesHtml);
                }
            }
        }
    }
}

// Render episodes for a season
function renderSeasonEpisodes(seasonData) {
    const { seriesId, seasonNumber, episodes } = seasonData;
    let html = '';
    
    // Filter episodes based on unwatched filter
    const episodesToShow = watchlistFilters.unwatched ? 
        episodes.filter(ep => !ep.watched) : 
        episodes;
    
    for (const ep of episodesToShow) {
        html += renderEpisodeRow(ep, seriesId);
    }
    
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
            
            // Show educational tip if user just marked their first item as watched
            if (result.watched && !localStorage.getItem('hasSeenWatchedTip')) {
                showWatchedItemEducationTip();
            }
            
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

// Item Menu Component Functions
let currentOpenMenu = null;

function openItemMenu(itemId, itemType, listId, event) {
    event.stopPropagation();
    
    // Close any existing menu
    closeItemMenu();
    
    // Get the button that was clicked
    const button = event.currentTarget;
    const row = button.closest('.watchlist-row');
    
    // Create menu dropdown
    const menu = document.createElement('div');
    menu.className = 'item-menu-dropdown show';
    menu.id = 'itemMenuDropdown';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Item actions menu');
    
    // Add menu options
    menu.innerHTML = `
        <div class="item-menu-option" data-action="copy" role="menuitem" tabindex="0" aria-label="Copy item to another list">
            <span aria-hidden="true">📋</span>
            Copy to List
        </div>
        <div class="item-menu-option" data-action="move" role="menuitem" tabindex="0" aria-label="Move item to another list">
            <span aria-hidden="true">➡️</span>
            Move to List
        </div>
        <div class="item-menu-option danger" data-action="remove" role="menuitem" tabindex="0" aria-label="Remove item from this list">
            <span aria-hidden="true">🗑️</span>
            Remove from List
        </div>
    `;
    
    // Position menu relative to the button
    row.style.position = 'relative';
    row.appendChild(menu);
    
    // Get all menu options for keyboard navigation
    const menuOptions = menu.querySelectorAll('.item-menu-option');
    let currentFocusIndex = 0;
    
    // Add click handlers to menu options
    menuOptions.forEach((option, index) => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = option.getAttribute('data-action');
            handleMenuAction(action, itemId, itemType, listId, button);
            closeItemMenu();
        });
        
        // Keyboard support
        option.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const action = option.getAttribute('data-action');
                handleMenuAction(action, itemId, itemType, listId, button);
                closeItemMenu();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeItemMenu();
                button.focus(); // Return focus to menu button
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocusIndex = (index + 1) % menuOptions.length;
                menuOptions[currentFocusIndex].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocusIndex = (index - 1 + menuOptions.length) % menuOptions.length;
                menuOptions[currentFocusIndex].focus();
            } else if (e.key === 'Tab') {
                // Allow Tab to cycle through menu items
                if (e.shiftKey) {
                    if (index === 0) {
                        e.preventDefault();
                        menuOptions[menuOptions.length - 1].focus();
                    }
                } else {
                    if (index === menuOptions.length - 1) {
                        e.preventDefault();
                        menuOptions[0].focus();
                    }
                }
            }
        });
    });
    
    // Store reference to current menu
    currentOpenMenu = menu;
    
    // Focus first menu item
    if (menuOptions.length > 0) {
        menuOptions[0].focus();
    }
    
    // Update button aria-expanded state
    button.setAttribute('aria-expanded', 'true');
    
    // Add click-outside-to-close listener
    setTimeout(() => {
        document.addEventListener('click', closeItemMenuOnClickOutside);
        document.addEventListener('keydown', closeItemMenuOnEscape);
    }, 0);
}

function closeItemMenu() {
    if (currentOpenMenu) {
        // Find the menu button and update aria-expanded
        const menuButton = document.querySelector('.item-menu-btn[aria-expanded="true"]');
        if (menuButton) {
            menuButton.setAttribute('aria-expanded', 'false');
        }
        
        currentOpenMenu.remove();
        currentOpenMenu = null;
    }
    document.removeEventListener('click', closeItemMenuOnClickOutside);
    document.removeEventListener('keydown', closeItemMenuOnEscape);
}

function closeItemMenuOnClickOutside(event) {
    if (currentOpenMenu && !currentOpenMenu.contains(event.target)) {
        closeItemMenu();
    }
}

function closeItemMenuOnEscape(event) {
    if (event.key === 'Escape' && currentOpenMenu) {
        const menuButton = document.querySelector('.item-menu-btn[aria-expanded="true"]');
        closeItemMenu();
        if (menuButton) {
            menuButton.focus(); // Return focus to menu button
        }
    }
}

// Long-press gesture support for mobile devices
let longPressTimer = null;
let longPressTarget = null;

function setupLongPressGesture(row, itemId, itemType, listId) {
    // Only enable on touch devices
    if (!('ontouchstart' in window)) {
        return;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    const moveThreshold = 10; // pixels

    row.addEventListener('touchstart', function(e) {
        // Don't trigger on buttons or interactive elements
        if (e.target.closest('button, input, a, .item-menu-btn')) {
            return;
        }

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        longPressTarget = row;
        
        longPressTimer = setTimeout(() => {
            // Trigger haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            // Add visual feedback
            row.classList.add('long-press-active');
            setTimeout(() => {
                row.classList.remove('long-press-active');
            }, 500);
            
            // Create a synthetic event for openItemMenu
            const syntheticEvent = {
                stopPropagation: () => {},
                currentTarget: row.querySelector('.item-menu-btn') || row
            };
            
            openItemMenu(itemId, itemType, listId, syntheticEvent);
            longPressTimer = null;
        }, 500); // 500ms long press
    }, { passive: true });

    row.addEventListener('touchmove', function(e) {
        if (longPressTimer) {
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = Math.abs(touchX - touchStartX);
            const deltaY = Math.abs(touchY - touchStartY);

            // Cancel long press if finger moves too much
            if (deltaX > moveThreshold || deltaY > moveThreshold) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                longPressTarget = null;
            }
        }
    }, { passive: true });

    row.addEventListener('touchend', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressTarget = null;
    }, { passive: true });

    row.addEventListener('touchcancel', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressTarget = null;
    }, { passive: true });
}

function handleMenuAction(action, itemId, itemType, listId, menuButton = null) {
    console.log('Menu action:', action, 'for item:', itemId, 'type:', itemType, 'list:', listId);
    
    // Show loading state on menu button if provided
    if (menuButton) {
        const originalContent = menuButton.innerHTML;
        menuButton.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px;" aria-label="Loading"></div>';
        menuButton.disabled = true;
        menuButton.setAttribute('aria-busy', 'true');
        
        // Store original content for restoration
        menuButton.dataset.originalContent = originalContent;
    }
    
    switch (action) {
        case 'copy':
            showListSelector('copy', itemId, itemType, listId);
            break;
        case 'move':
            showListSelector('move', itemId, itemType, listId);
            break;
        case 'remove':
            // Use existing remove functionality
            removeFromWatchlist(itemType, itemId);
            break;
    }
    
    // Restore menu button state after a short delay (modal will be shown)
    if (menuButton) {
        setTimeout(() => {
            if (menuButton.dataset.originalContent) {
                menuButton.innerHTML = menuButton.dataset.originalContent;
                menuButton.disabled = false;
                menuButton.removeAttribute('aria-busy');
            }
        }, 500);
    }
}

// PERFORMANCE: Debounce utility to prevent rapid duplicate operations
let operationDebounceTimer = null;
const OPERATION_DEBOUNCE_DELAY = 300; // 300ms debounce

function debounceOperation(fn, ...args) {
    if (operationDebounceTimer) {
        console.log('Operation debounced - preventing duplicate call');
        return false;
    }
    
    operationDebounceTimer = setTimeout(() => {
        operationDebounceTimer = null;
    }, OPERATION_DEBOUNCE_DELAY);
    
    fn(...args);
    return true;
}

// List Selector Modal Functions
async function showListSelector(operation, itemId, itemType, sourceListId, isBulk = false) {
    const modal = document.getElementById('listSelectorModal');
    const title = document.getElementById('listSelectorTitle');
    const subtitle = document.getElementById('listSelectorSubtitle');
    const content = document.getElementById('listSelectorContent');
    
    // Set ARIA attributes for modal
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    
    // Update modal title based on operation and bulk mode
    if (isBulk) {
        const itemCount = bulkSelectionState.selectedItems.length;
        if (operation === 'copy') {
            title.textContent = '📋 Copy Items to List';
            subtitle.textContent = `Choose where to copy ${itemCount} selected item${itemCount !== 1 ? 's' : ''}`;
            modal.setAttribute('aria-label', `Copy ${itemCount} items to list`);
        } else if (operation === 'move') {
            title.textContent = '➡️ Move Items to List';
            subtitle.textContent = `Choose where to move ${itemCount} selected item${itemCount !== 1 ? 's' : ''}`;
            modal.setAttribute('aria-label', `Move ${itemCount} items to list`);
        }
    } else {
        if (operation === 'copy') {
            title.textContent = '📋 Copy to List';
            subtitle.textContent = 'Choose where to copy this item';
            modal.setAttribute('aria-label', 'Copy item to list');
        } else if (operation === 'move') {
            title.textContent = '➡️ Move to List';
            subtitle.textContent = 'Choose where to move this item';
            modal.setAttribute('aria-label', 'Move item to list');
        }
    }
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = `
        <div class="list-selector-loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p>Loading lists...</p>
        </div>
    `;
    
    // Add click-outside-to-close functionality
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeListSelector();
        }
    };
    
    // Add keyboard event listener for Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeListSelector();
        }
    };
    modal.addEventListener('keydown', handleEscape);
    modal.dataset.escapeHandler = 'attached';
    
    // Focus trap - keep focus within modal
    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    
    try {
        // PERFORMANCE: Fetch available target lists with pagination support
        const response = await fetch(`${API_BASE}/lists/${sourceListId}/available-targets?page=1&page_size=50`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch available lists');
        }
        
        const data = await response.json();
        const lists = data.lists || [];
        const pagination = data.pagination || {};
        
        // PERFORMANCE: Render list options with lazy loading for large lists
        renderListOptions(lists, operation, itemId, itemType, sourceListId, isBulk, pagination);
        
        // Focus first list option after rendering
        setTimeout(() => {
            const firstOption = modal.querySelector('.list-option');
            if (firstOption) {
                firstOption.focus();
            }
        }, 100);
        
    } catch (error) {
        console.error('Error fetching lists:', error);
        content.innerHTML = `
            <div class="list-selector-loading" role="alert" aria-live="assertive">
                <p style="color: #ff6b6b;">Failed to load lists. Please try again.</p>
            </div>
        `;
    }
}

function renderListOptions(lists, operation, itemId, itemType, sourceListId, isBulk = false, pagination = {}) {
    const content = document.getElementById('listSelectorContent');
    
    if (lists.length === 0) {
        content.innerHTML = `
            <div class="list-selector-loading">
                <p>No other lists available.</p>
            </div>
            <div class="create-new-option">
                <button class="btn-create-list" onclick="createNewListAndCopy('${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})">
                    + Create New List
                </button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="list-options">';
    
    // PERFORMANCE: Lazy render - only render visible items initially
    const INITIAL_RENDER_COUNT = 20;
    const visibleLists = lists.slice(0, INITIAL_RENDER_COUNT);
    const remainingLists = lists.slice(INITIAL_RENDER_COUNT);
    
    visibleLists.forEach(list => {
        html += renderListOption(list, operation, itemId, itemType, sourceListId, isBulk);
    });
    
    html += '</div>';
    
    // Add pagination info if there are more pages
    if (pagination.has_more) {
        html += `
            <div class="list-selector-pagination">
                <p>Showing ${lists.length} of ${pagination.total_lists} lists</p>
                <button class="btn-load-more" onclick="loadMoreLists(${pagination.page + 1}, '${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})">
                    Load More Lists
                </button>
            </div>
        `;
    }
    
    // Add "Create New List" option
    html += `
        <div class="create-new-option">
            <button class="btn-create-list" onclick="createNewListAndCopy('${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})">
                + Create New List
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // PERFORMANCE: Lazy load remaining items after initial render
    if (remainingLists.length > 0) {
        requestAnimationFrame(() => {
            const listOptionsContainer = content.querySelector('.list-options');
            if (listOptionsContainer) {
                remainingLists.forEach(list => {
                    const listElement = document.createElement('div');
                    listElement.innerHTML = renderListOption(list, operation, itemId, itemType, sourceListId, isBulk);
                    listOptionsContainer.appendChild(listElement.firstElementChild);
                });
            }
        });
    }
}

// PERFORMANCE: Helper function to render a single list option
function renderListOption(list, operation, itemId, itemType, sourceListId, isBulk) {
    const icon = list.icon || '📋';
    const name = list.name || 'Unnamed List';
    const count = list.item_count || 0;
    const color = list.color || '#00d4aa';
    const actionText = operation === 'copy' ? 'Copy to' : 'Move to';
    
    return `
        <div class="list-option" 
             role="button" 
             tabindex="0"
             aria-label="${actionText} ${name} list with ${count} item${count !== 1 ? 's' : ''}"
             data-list-id="${list.id}"
             data-operation="${operation}"
             data-item-id="${itemId}"
             data-item-type="${itemType}"
             data-source-list-id="${sourceListId}"
             data-is-bulk="${isBulk}"
             onclick="debounceOperation(selectTargetList, ${list.id}, '${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})" 
             onkeydown="handleListOptionKeydown(event, ${list.id}, '${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})"
             style="border-left: 3px solid ${color};">
            <div class="list-option-icon" aria-hidden="true">${icon}</div>
            <div class="list-option-info">
                <p class="list-option-name">${name}</p>
                <p class="list-option-count" aria-label="${count} items">${count} item${count !== 1 ? 's' : ''}</p>
            </div>
        </div>
    `;
}

// Handle keyboard navigation for list options
function handleListOptionKeydown(event, listId, operation, itemId, itemType, sourceListId, isBulk) {
    const currentOption = event.currentTarget;
    const allOptions = Array.from(document.querySelectorAll('.list-option'));
    const currentIndex = allOptions.indexOf(currentOption);
    
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        debounceOperation(selectTargetList, listId, operation, itemId, itemType, sourceListId, isBulk);
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % allOptions.length;
        allOptions[nextIndex].focus();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIndex = (currentIndex - 1 + allOptions.length) % allOptions.length;
        allOptions[prevIndex].focus();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        closeListSelector();
    } else if (event.key === 'Home') {
        event.preventDefault();
        allOptions[0].focus();
    } else if (event.key === 'End') {
        event.preventDefault();
        allOptions[allOptions.length - 1].focus();
    }
}

// PERFORMANCE: Load more lists for pagination
async function loadMoreLists(page, operation, itemId, itemType, sourceListId, isBulk) {
    const content = document.getElementById('listSelectorContent');
    const paginationDiv = content.querySelector('.list-selector-pagination');
    
    if (paginationDiv) {
        paginationDiv.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
    }
    
    try {
        const response = await fetch(`${API_BASE}/lists/${sourceListId}/available-targets?page=${page}&page_size=50`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch more lists');
        }
        
        const data = await response.json();
        const lists = data.lists || [];
        const pagination = data.pagination || {};
        
        // Append new lists to existing container
        const listOptionsContainer = content.querySelector('.list-options');
        if (listOptionsContainer) {
            lists.forEach(list => {
                const listElement = document.createElement('div');
                listElement.innerHTML = renderListOption(list, operation, itemId, itemType, sourceListId, isBulk);
                listOptionsContainer.appendChild(listElement.firstElementChild);
            });
        }
        
        // Update or remove pagination controls
        if (pagination.has_more) {
            paginationDiv.innerHTML = `
                <p>Showing ${pagination.page * pagination.page_size} of ${pagination.total_lists} lists</p>
                <button class="btn-load-more" onclick="loadMoreLists(${pagination.page + 1}, '${operation}', ${itemId}, '${itemType}', ${sourceListId}, ${isBulk})">
                    Load More Lists
                </button>
            `;
        } else {
            paginationDiv.remove();
        }
        
    } catch (error) {
        console.error('Error loading more lists:', error);
        if (paginationDiv) {
            paginationDiv.innerHTML = '<p style="color: #ff6b6b;">Failed to load more lists</p>';
        }
    }
}

function closeListSelector() {
    const modal = document.getElementById('listSelectorModal');
    modal.style.display = 'none';
}

async function selectTargetList(targetListId, operation, itemId, itemType, sourceListId, isBulk = false) {
    // Show loading state in modal
    const content = document.getElementById('listSelectorContent');
    content.innerHTML = `
        <div class="list-selector-loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p aria-label="Processing operation">Processing...</p>
        </div>
    `;
    
    // Close modal immediately - the operation will show its own loading state
    closeListSelector();
    
    try {
        if (isBulk) {
            // Handle bulk operations
            if (operation === 'copy') {
                await executeBulkCopyOperation(targetListId);
            } else if (operation === 'move') {
                await executeBulkMoveOperation(targetListId);
            }
        } else {
            // Handle single item operations
            if (operation === 'copy') {
                await executeCopyOperation(itemId, itemType, sourceListId, targetListId);
            } else if (operation === 'move') {
                await executeMoveOperation(itemId, itemType, sourceListId, targetListId);
            }
        }
    } catch (error) {
        console.error('Error executing operation:', error);
        showError(`Failed to ${operation} item. Please try again.`);
    }
}

async function executeCopyOperation(itemId, itemType, sourceListId, targetListId, skipDuplicateCheck = false) {
    // Cache operation details for potential retry
    const operationDetails = {
        type: 'copy',
        params: { itemId, itemType, sourceListId, targetListId, skipDuplicateCheck }
    };
    operationCache.lastOperation = operationDetails;
    
    // Log operation start
    logOperation('COPY_START', {
        itemId,
        itemType,
        sourceListId,
        targetListId,
        skipDuplicateCheck
    });
    
    try {
        // Show loading state
        showLoading('Copying item...');
        
        // Check for duplicates first (unless explicitly skipped)
        if (!skipDuplicateCheck) {
            const hasDuplicate = await checkForDuplicate(itemId, itemType, targetListId);
            if (hasDuplicate) {
                hideLoading();
                // Show duplicate warning modal for copy operation
                showDuplicateWarning('copy', itemId, itemType, sourceListId, targetListId);
                logOperation('COPY_DUPLICATE', { itemId, itemType, targetListId });
                return;
            }
        }
        
        const response = await fetch(`${API_BASE}/lists/${sourceListId}/items/${itemId}/copy`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                target_list_id: targetListId,
                item_type: itemType,
                preserve_metadata: true
            })
        });
        
        hideLoading();
        
        if (!response.ok) {
            const error = await response.json();
            const errorInfo = categorizeError(new Error(error.detail || 'Copy operation failed'), response);
            
            // Log error
            logOperation('COPY_ERROR', operationDetails.params, null, new Error(errorInfo.message));
            
            // Show error with retry if recoverable
            if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
                showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
            } else {
                showError(errorInfo.message);
                operationCache.retryCount = 0;
                operationCache.lastOperation = null;
            }
            return;
        }
        
        const result = await response.json();
        
        // Log success
        logOperation('COPY_SUCCESS', operationDetails.params, result);
        
        // Reset retry count on success
        operationCache.retryCount = 0;
        operationCache.lastOperation = null;
        
        // Show success message
        if (result.duplicate && result.items_affected === 0) {
            showSuccess(`All items already exist in target list`);
        } else if (result.duplicate) {
            showSuccess(`${result.items_affected} item(s) copied (${result.message.match(/\d+/)?.[0] || 0} duplicate(s) skipped)`);
        } else {
            showSuccess(result.message || 'Item copied successfully');
        }
        
        // Refresh watchlist
        await loadWatchlist();
        
        // Refresh details modal list membership if modal is open
        await refreshDetailsModalListMembership();
        
    } catch (error) {
        hideLoading();
        
        // Log error
        logOperation('COPY_EXCEPTION', operationDetails.params, null, error);
        
        // Categorize error
        const errorInfo = categorizeError(error);
        
        // Show error with retry if recoverable
        if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
            showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
        } else {
            showError(errorInfo.message);
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
        }
    }
}

async function executeMoveOperation(itemId, itemType, sourceListId, targetListId, skipDuplicateCheck = false) {
    // Cache operation details for potential retry
    const operationDetails = {
        type: 'move',
        params: { itemId, itemType, sourceListId, targetListId, skipDuplicateCheck }
    };
    operationCache.lastOperation = operationDetails;
    
    // Log operation start
    logOperation('MOVE_START', {
        itemId,
        itemType,
        sourceListId,
        targetListId,
        skipDuplicateCheck
    });
    
    try {
        // Show loading state
        showLoading('Moving item...');
        
        // Check for duplicates first (unless explicitly skipped)
        if (!skipDuplicateCheck) {
            const hasDuplicate = await checkForDuplicate(itemId, itemType, targetListId);
            if (hasDuplicate) {
                hideLoading();
                // Show duplicate warning modal for move operation
                showDuplicateWarning('move', itemId, itemType, sourceListId, targetListId);
                logOperation('MOVE_DUPLICATE', { itemId, itemType, targetListId });
                return;
            }
        }
        
        const response = await fetch(`${API_BASE}/lists/${sourceListId}/items/${itemId}/move`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                target_list_id: targetListId,
                item_type: itemType
            })
        });
        
        hideLoading();
        
        if (!response.ok) {
            const error = await response.json();
            const errorInfo = categorizeError(new Error(error.detail || 'Move operation failed'), response);
            
            // Log error
            logOperation('MOVE_ERROR', operationDetails.params, null, new Error(errorInfo.message));
            
            // Show error with retry if recoverable
            if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
                showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
            } else {
                showError(errorInfo.message);
                operationCache.retryCount = 0;
                operationCache.lastOperation = null;
            }
            return;
        }
        
        const result = await response.json();
        
        // Log success
        logOperation('MOVE_SUCCESS', operationDetails.params, result);
        
        // Reset retry count on success
        operationCache.retryCount = 0;
        operationCache.lastOperation = null;
        
        // Store undo data for this move operation
        undoMoveData = {
            sourceListId: sourceListId,
            targetListId: targetListId,
            items: [{
                item_id: parseInt(itemId),
                item_type: itemType
            }]
        };
        
        // Clear any existing undo timeout
        if (undoTimeout) {
            clearTimeout(undoTimeout);
        }
        
        // Set timeout to clear undo data after 10 seconds
        undoTimeout = setTimeout(() => {
            undoMoveData = null;
            undoTimeout = null;
        }, 10000);
        
        // Show success message with undo button
        let message;
        if (result.duplicate && result.items_affected === 0) {
            message = `All items already exist in target list. Removed from source.`;
        } else if (result.duplicate) {
            message = `${result.items_affected} item(s) moved (${result.message.match(/\d+/)?.[0] || 0} duplicate(s) removed from source)`;
        } else {
            message = result.message || 'Item moved successfully';
        }
        
        showSuccess(message, {
            showUndo: true,
            onUndo: () => undoMoveOperation(undoMoveData),
            duration: 10000
        });
        
        // Refresh watchlist
        await loadWatchlist();
        
        // Refresh details modal list membership if modal is open
        await refreshDetailsModalListMembership();
        
    } catch (error) {
        hideLoading();
        
        // Log error
        logOperation('MOVE_EXCEPTION', operationDetails.params, null, error);
        
        // Categorize error
        const errorInfo = categorizeError(error);
        
        // Show error with retry if recoverable
        if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
            showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
        } else {
            showError(errorInfo.message);
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
        }
    }
}

// Check if an item already exists in a target list
async function checkForDuplicate(itemId, itemType, targetListId) {
    try {
        // Fetch the target list items
        const response = await fetch(`${API_BASE}/lists/${targetListId}/items`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            console.error('Failed to fetch target list items');
            return false;
        }
        
        const items = await response.json();
        
        // Check if the item already exists in the target list
        const duplicate = items.some(item => 
            item.item_id === itemId && item.item_type === itemType
        );
        
        return duplicate;
    } catch (error) {
        console.error('Error checking for duplicate:', error);
        return false;
    }
}

// Show duplicate warning modal
function showDuplicateWarning(operation, itemId, itemType, sourceListId, targetListId) {
    const modal = document.getElementById('duplicateWarningModal');
    const title = document.getElementById('duplicateWarningTitle');
    const subtitle = document.getElementById('duplicateWarningSubtitle');
    const content = document.getElementById('duplicateWarningContent');
    const buttonsContainer = document.getElementById('duplicateWarningButtons');
    
    // Get target list name
    const targetList = userLists.find(list => list.id == targetListId);
    const targetListName = targetList ? targetList.name : 'the target list';
    
    // Update modal content based on operation type
    if (operation === 'copy') {
        title.textContent = '⚠️ Duplicate Item Detected';
        subtitle.textContent = 'This item already exists in the target list';
        content.innerHTML = `
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 20px;">
                This item is already in <strong>${targetListName}</strong>.
            </p>
            <p style="color: rgba(255, 255, 255, 0.6); font-size: 0.9em;">
                You can skip this duplicate and keep the existing item, or cancel the operation.
            </p>
        `;
        
        // Buttons for copy operation
        buttonsContainer.innerHTML = `
            <button class="btn btn-secondary" onclick="closeDuplicateWarning()">Cancel</button>
            <button class="btn btn-primary" onclick="proceedWithCopy(${itemId}, '${itemType}', ${sourceListId}, ${targetListId})">
                Skip Duplicate
            </button>
        `;
    } else if (operation === 'move') {
        title.textContent = '⚠️ Duplicate Item Detected';
        subtitle.textContent = 'This item already exists in the target list';
        content.innerHTML = `
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 20px;">
                This item is already in <strong>${targetListName}</strong>.
            </p>
            <p style="color: rgba(255, 255, 255, 0.6); font-size: 0.9em;">
                You can remove it from the source list only, or cancel the operation.
            </p>
        `;
        
        // Buttons for move operation
        buttonsContainer.innerHTML = `
            <button class="btn btn-secondary" onclick="closeDuplicateWarning()">Cancel</button>
            <button class="btn btn-primary" onclick="proceedWithMove(${itemId}, '${itemType}', ${sourceListId}, ${targetListId})">
                Remove from Source Only
            </button>
        `;
    }
    
    // Show modal
    modal.style.display = 'flex';
}

// Close duplicate warning modal
function closeDuplicateWarning() {
    const modal = document.getElementById('duplicateWarningModal');
    modal.style.display = 'none';
}

// Proceed with copy operation (skip duplicate)
async function proceedWithCopy(itemId, itemType, sourceListId, targetListId) {
    closeDuplicateWarning();
    closeListSelector();
    
    try {
        // Execute copy with duplicate check skipped
        await executeCopyOperation(itemId, itemType, sourceListId, targetListId, true);
    } catch (error) {
        console.error('Error in copy operation:', error);
        showError(error.message || 'Failed to copy item');
    }
}

// Proceed with move operation (remove from source only)
async function proceedWithMove(itemId, itemType, sourceListId, targetListId) {
    closeDuplicateWarning();
    closeListSelector();
    
    try {
        // Execute move with duplicate check skipped
        await executeMoveOperation(itemId, itemType, sourceListId, targetListId, true);
    } catch (error) {
        console.error('Error in move operation:', error);
        showError(error.message || 'Failed to move item');
    }
}

function createNewListAndCopy(operation, itemId, itemType, sourceListId) {
    // Close list selector
    closeListSelector();
    
    // Store the pending operation
    window.pendingCopyMoveOperation = {
        operation,
        itemId,
        itemType,
        sourceListId
    };
    
    // Open create list modal
    showCreateListModal();
}

// Undo move operation
async function undoMoveOperation(operationDetails) {
    try {
        showLoading('Undoing move operation...');
        
        // Clear the undo timeout
        if (undoTimeout) {
            clearTimeout(undoTimeout);
            undoTimeout = null;
        }
        
        // Move items back to source list
        const response = await fetch(`${API_BASE}/lists/bulk-operation`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                operation: 'move',
                source_list_id: operationDetails.targetListId,
                target_list_id: operationDetails.sourceListId,
                items: operationDetails.items
            })
        });
        
        hideLoading();
        
        if (response.ok) {
            const result = await response.json();
            showSuccess('Move operation undone successfully');
            
            // Clear undo data
            undoMoveData = null;
            
            // Reload watchlist
            await loadWatchlist();
            
            // Refresh details modal list membership if modal is open
            await refreshDetailsModalListMembership();
        } else {
            const error = await response.json();
            showError(error.detail || 'Failed to undo move operation');
        }
    } catch (error) {
        hideLoading();
        console.error('Error undoing move operation:', error);
        showError('Failed to undo move operation');
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
        errorDiv.setAttribute('role', 'alert');
        errorDiv.setAttribute('aria-live', 'assertive');
        document.body.appendChild(errorDiv);
    }
    
    // Add error icon with animation
    errorDiv.innerHTML = `
        <span class="message-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
                <path class="xmark-icon" d="M6 6L18 18M18 6L6 18" stroke-linecap="round"/>
            </svg>
        </span>
        <span>${message}</span>
    `;
    errorDiv.style.display = 'block';
    
    // Trigger animation
    errorDiv.classList.remove('animate');
    void errorDiv.offsetWidth; // Force reflow
    errorDiv.classList.add('animate');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message, options = {}) {
    // Create or update success message
    let successDiv = document.querySelector('.success-message');
    if (!successDiv) {
        successDiv = document.createElement('div');
        successDiv.className = 'success success-message';
        successDiv.style.position = 'fixed';
        successDiv.style.top = '20px';
        successDiv.style.right = '20px';
        successDiv.style.zIndex = '10000';
        successDiv.style.maxWidth = '400px';
        successDiv.setAttribute('role', 'status');
        successDiv.setAttribute('aria-live', 'polite');
        document.body.appendChild(successDiv);
    }
    
    // Clear any existing content
    successDiv.innerHTML = '';
    
    // Create message container
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.alignItems = 'center';
    messageContainer.style.justifyContent = 'space-between';
    messageContainer.style.gap = '12px';
    
    // Add success icon with animation
    const iconSpan = document.createElement('span');
    iconSpan.className = 'message-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none">
            <path class="checkmark-icon" d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    messageContainer.appendChild(iconSpan);
    
    // Add message text
    const messageText = document.createElement('span');
    messageText.textContent = message;
    messageText.style.flex = '1';
    messageContainer.appendChild(messageText);
    
    // Add undo button if provided
    if (options.showUndo && options.onUndo) {
        const undoButton = document.createElement('button');
        undoButton.textContent = 'Undo';
        undoButton.className = 'btn btn-secondary';
        undoButton.style.padding = '4px 12px';
        undoButton.style.fontSize = '13px';
        undoButton.style.minWidth = 'auto';
        undoButton.style.whiteSpace = 'nowrap';
        undoButton.setAttribute('aria-label', 'Undo move operation');
        undoButton.onclick = () => {
            options.onUndo();
            successDiv.style.display = 'none';
        };
        messageContainer.appendChild(undoButton);
    }
    
    successDiv.appendChild(messageContainer);
    successDiv.style.display = 'block';
    
    // Trigger animation
    successDiv.classList.remove('animate');
    void successDiv.offsetWidth; // Force reflow
    successDiv.classList.add('animate');
    
    // Auto-hide after specified duration or default 6 seconds
    const duration = options.duration || 6000;
    setTimeout(() => {
        successDiv.style.display = 'none';
    }, duration);
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

// Global loading overlay
function showLoading(message = 'Loading...') {
    let loadingOverlay = document.querySelector('.loading-overlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.setAttribute('role', 'status');
        loadingOverlay.setAttribute('aria-live', 'polite');
        loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner" aria-hidden="true"></div>
                <p class="loading-message"></p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
    }
    
    const messageElement = loadingOverlay.querySelector('.loading-message');
    messageElement.textContent = message;
    loadingOverlay.setAttribute('aria-label', message);
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Update progress for bulk operations
function updateBulkProgress(current, total, operation = 'Processing') {
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
        const messageElement = loadingOverlay.querySelector('.loading-message');
        const message = `${operation} ${current} of ${total} items...`;
        messageElement.textContent = message;
        loadingOverlay.setAttribute('aria-label', message);
    }
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
    
    // Check authentication - this will work for both normal login and Auth0 callback
    const authResult = await checkAuth();
    if (!authResult) {
        console.log('Authentication failed, redirecting to login');
        return;
    }
    
    // Check admin status after successful authentication
    await checkAdminStatus();
    
    console.log('Setting up event listeners...');
    
    // Load saved filter state or set defaults
    loadFilterState();
    // Only set defaults if no saved state exists
    if (!localStorage.getItem('watchlistFilters')) {
        setDefaultFilterState();
    }
    
    // SAFETY CHECK: Ensure at least Movies OR Series filter is enabled
    // Otherwise the watchlist will be completely empty!
    if (!watchlistFilters.movies && !watchlistFilters.series) {
        console.warn('⚠️ Both Movies and Series filters were disabled! Re-enabling Movies filter.');
        watchlistFilters.movies = true;
        updateFilterState(); // Save the fix
    }
    
    // Ensure watchlistState is properly initialized
    ensureWatchlistStateInitialized();
    
    loadWatchlist();
    
    // Update sort button text to show current sort option
    updateSortButtonText();
    
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
        if (!e.target.closest('.settings-menu') && !e.target.closest('#settingsDropdown')) {
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
    // Set default filters to show all items (both watched and unwatched)
    watchlistFilters = { 
        movies: true, 
        series: true, 
        unwatched: false,  // Changed to false - show BOTH watched and unwatched by default
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

// Show educational tip when user marks their first item as watched
function showWatchedItemEducationTip() {
    // Set the flag immediately to prevent showing again
    localStorage.setItem('hasSeenWatchedTip', 'true');
    
    // Create toast container
    const toast = document.createElement('div');
    toast.className = 'education-toast';
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon">✅</div>
            <div class="toast-text">
                <strong>Marked as watched!</strong>
                <p>Watched items are still in your list. Use the Filter button to show/hide them.</p>
            </div>
        </div>
        <div class="toast-actions">
            <button class="toast-btn toast-btn-secondary" id="toastDismiss">Got it</button>
            <button class="toast-btn toast-btn-primary" id="toastShowMe">Show Me</button>
        </div>
    `;
    
    // Add styles if not already present
    if (!document.getElementById('educationToastStyle')) {
        const style = document.createElement('style');
        style.id = 'educationToastStyle';
        style.textContent = `
            .education-toast {
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(30, 30, 30, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                padding: 16px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                z-index: 10000;
                animation: slideUp 0.3s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            .toast-content {
                display: flex;
                gap: 12px;
                margin-bottom: 12px;
            }
            
            .toast-icon {
                font-size: 24px;
                flex-shrink: 0;
            }
            
            .toast-text {
                flex: 1;
            }
            
            .toast-text strong {
                display: block;
                color: #fff;
                font-size: 15px;
                margin-bottom: 4px;
            }
            
            .toast-text p {
                color: rgba(255, 255, 255, 0.8);
                font-size: 13px;
                margin: 0;
                line-height: 1.4;
            }
            
            .toast-actions {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            
            .toast-btn {
                padding: 8px 16px;
                border-radius: 8px;
                border: none;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .toast-btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .toast-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            .toast-btn-primary {
                background: #007AFF;
                color: #fff;
            }
            
            .toast-btn-primary:hover {
                background: #0051D5;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Handle dismiss
    document.getElementById('toastDismiss').onclick = () => {
        toast.style.animation = 'slideDown 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    };
    
    // Handle "Show Me" - open filter menu and highlight the unwatched toggle
    document.getElementById('toastShowMe').onclick = () => {
        toast.style.animation = 'slideDown 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
        
        // Open the filter menu
        showFilterOptions();
        
        // Highlight the unwatched filter after a brief delay
        setTimeout(() => {
            const unwatchedChip = document.querySelector('.filter-chip[data-filter="unwatched"]');
            if (unwatchedChip) {
                unwatchedChip.style.animation = 'pulse 1s ease-in-out 3';
                unwatchedChip.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.5)';
                
                // Remove highlight after animation
                setTimeout(() => {
                    unwatchedChip.style.animation = '';
                    unwatchedChip.style.boxShadow = '';
                }, 3000);
            }
        }, 500);
    };
    
    // Add pulse animation if not present
    if (!document.getElementById('pulseAnimation')) {
        const style = document.createElement('style');
        style.id = 'pulseAnimation';
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            @keyframes slideDown {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                }
            }
        `;
        document.head.appendChild(style);
    }
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
        const isHidden = dropdown.style.display === 'none';
        dropdown.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            const btn = document.getElementById('settingsBtn');
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = rect.bottom + 'px';
            dropdown.style.right = (window.innerWidth - rect.right) + 'px';
        }
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

    // Create glass-styled sort row
    const sortRow = document.createElement('div');
    sortRow.id = 'sortOptionsRow';
    sortRow.className = 'action-bar';

    // Title with close button
    const titleContainer = document.createElement('div');
    titleContainer.className = 'action-bar-title';

    const title = document.createElement('span');
    title.textContent = 'Sort Options';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'action-bar-close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = () => {
        sortRow.remove();
        updateSortButtonText();
    };

    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);
    sortRow.appendChild(titleContainer);

    // Sort chips container
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'action-bar-chips';
    
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

        // Determine if this chip is active
        let isActive = false;
        if (option.key === 'alphabetical' && (currentSort === 'alphabetical' || currentSort === 'alphabetical_reverse')) {
            isActive = true;
        } else if (option.key === 'added' && (currentSort === 'added' || currentSort === 'added_newest')) {
            isActive = true;
        } else if (option.key === 'release_date' && (currentSort === 'release_date' || currentSort === 'release_date_newest')) {
            isActive = true;
        }

        chip.className = isActive ? 'action-bar-chip active' : 'action-bar-chip';
        
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

    // Create glass-styled filter row
    const filterRow = document.createElement('div');
    filterRow.id = 'filterOptionsRow';
    filterRow.className = 'action-bar';

    // Title with close button
    const titleContainer = document.createElement('div');
    titleContainer.className = 'action-bar-title';

    const title = document.createElement('span');
    title.textContent = 'Filter Options';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'action-bar-close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = () => {
        filterRow.remove();
        updateFilterButtonText();
    };

    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);
    filterRow.appendChild(titleContainer);

    // Filter chips container
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'action-bar-chips';
    
    // Get current filter state
    const currentFilters = { ...watchlistFilters };
    
    // Create filter chips
    filterOptions.forEach(option => {
        const chip = document.createElement('div');
        chip.className = currentFilters[option.key] ? 'action-bar-chip active' : 'action-bar-chip';
        
        chip.innerHTML = `
            <span>${option.icon}</span>
            <span>${option.label}</span>
        `;
        
        chip.onclick = () => {
            // Toggle the filter
            currentFilters[option.key] = !currentFilters[option.key];

            // Update the global filter state
            watchlistFilters[option.key] = currentFilters[option.key];

            // Toggle CSS class
            chip.className = currentFilters[option.key] ? 'action-bar-chip active' : 'action-bar-chip';

            // Update filter state and reload watchlist
            updateFilterState();
            loadWatchlist();

            // Update the filter button text
            updateFilterButtonText();
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
    
    // All types now use the unified modal UI
    
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
        } else if (type === 'collection') {
            // Collection data structure
            poster = itemData.poster_url || '/static/no-image.png';
            title = itemData.title || 'Unknown Collection';
            overview = itemData.overview || 'No description available.';
            releaseDate = ''; // Collections don't have single release date
            runtime = ''; // Collections don't have single runtime
            quality = ''; // Collections don't have quality
            watched = itemData.items ? itemData.items.every(m => m.watched) : false;
            notes = itemData.notes || '';
        } else if (type === 'season') {
            // Season data structure
            poster = itemData.poster || '/static/no-image.png';
            title = `Season ${itemData.seasonNumber}`;
            overview = ''; // Seasons don't have descriptions
            releaseDate = ''; // Seasons don't have single release date
            runtime = ''; // Seasons don't have single runtime
            quality = ''; // Seasons don't have quality
            watched = itemData.episodes ? itemData.episodes.every(ep => ep.watched) : false;
            notes = ''; // Seasons don't have notes
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
        } else if (type === 'collection' && itemData.items) {
            const totalMovies = itemData.items.length;
            const watchedMovies = itemData.items.filter(m => m.watched).length;
            const unwatchedMovies = totalMovies - watchedMovies;
            
            if (watchedMovies === 0) {
                watchedStatus = '<span style="color: #ff6b6b; font-weight: bold;">○ Not Watched</span>';
            } else if (watchedMovies === totalMovies) {
                watchedStatus = '<span style="color: #00d4aa; font-weight: bold;">✓ Watched</span>';
            } else {
                watchedStatus = `<span style="color: #ffa500; font-weight: bold;">◐ Partially Watched</span> (${watchedMovies}/${totalMovies})`;
            }
        } else if (type === 'season' && itemData.episodes) {
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
                        ${type === 'movie' ? 'Movie' : 
                          type === 'episode' ? 'TV Episode' : 
                          type === 'collection' ? 'Collection' :
                          type === 'season' ? 'TV Season' :
                          'TV Series'}
                        ${type === 'episode' && itemData.seriesTitle ? ` • ${itemData.seriesTitle}` : ''}
                        ${type === 'episode' && itemData.seasonNumber && itemData.episodeNumber ? ` • Season ${itemData.seasonNumber}, Episode ${itemData.episodeNumber}` : ''}
                        ${type === 'collection' && itemData.items ? ` • ${itemData.items.length} movies` : ''}
                        ${type === 'season' && itemData.episodes ? ` • ${itemData.episodes.length} episodes` : ''}
                        ${releaseDate ? ` • ${releaseDate}` : ''}
                        ${runtime ? ` • ${runtime}` : ''}
                        ${quality ? ` • ${quality}` : ''}
                    </p>
                    <p style="color: #cccccc; margin: 0 0 12px 0;">${watchedStatus}</p>
                    <div style="color: #e0e6ff; line-height: 1.5;">${overview}</div>
                </div>
            </div>
        `;
        
        // Notes section (not available for episodes or seasons)
        if (type !== 'episode' && type !== 'season') {
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
                                <div style="flex: 1; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onclick="handleEpisodeClick('${itemData.id}', ${ep.season_number}, ${ep.episode_number})" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
                                    <span style="color: ${ep.watched ? '#666666' : '#ffffff'}; text-decoration: ${ep.watched ? 'line-through' : 'none'};">${ep.code} - ${ep.title}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Add additional details for collections
        if (type === 'collection' && itemData.items) {
            const movieCount = itemData.items.length;
            const unwatchedCount = itemData.items.filter(m => !m.watched).length;
            content += `
                <div style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <h3 style="color: #ffffff; margin: 0 0 12px 0;">Movies in Collection</h3>
                    <p style="color: #cccccc; margin: 0;">${movieCount} movies • ${unwatchedCount} unwatched</p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
                        ${itemData.items.map(movie => `
                            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;" onclick="showMovieDetails(${movie.id}, '${JSON.stringify(movie).replace(/"/g, '&quot;')}')">
                                <img src="${movie.poster_url || '/static/no-image.png'}" alt="Poster" style="width: 30px; height: 45px; object-fit: cover; border-radius: 3px;" onerror="this.src='/static/no-image.png';">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="color: ${movie.watched ? '#666666' : '#ffffff'}; text-decoration: ${movie.watched ? 'line-through' : 'none'}; font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${movie.title}</div>
                                    <div style="color: #cccccc; font-size: 0.7em;">${movie.release_date ? new Date(movie.release_date).getFullYear() : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Add additional details for seasons
        if (type === 'season' && itemData.episodes) {
            const episodeCount = itemData.episodes.length;
            const unwatchedCount = itemData.episodes.filter(ep => !ep.watched).length;
            content += `
                <div style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <h3 style="color: #ffffff; margin: 0 0 12px 0;">Episodes</h3>
                    <p style="color: #cccccc; margin: 0;">${episodeCount} episodes • ${unwatchedCount} unwatched</p>
                    <div style="margin-top: 12px;">
                        ${itemData.episodes.map(ep => `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer;" onclick="handleEpisodeClick('${itemData.seriesId}', ${ep.season_number}, ${ep.episode_number})">
                                <input type="checkbox" ${ep.watched ? 'checked' : ''} onclick="event.stopPropagation(); toggleEpisodeWatchedInDetails(${itemData.seriesId}, ${ep.season_number}, ${ep.episode_number}, this.checked)">
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
    
    // Get list membership for this item (only for movies, series, and collections)
    let listActionsSection = '';
    if (type !== 'episode' && type !== 'season') {
        const listMembership = await getItemListMembership(type, id);
        
        listActionsSection = `
            <div id="listActionsSection" style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                <h3 style="color: #ffffff; margin: 0 0 12px 0;">List Actions</h3>
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                    <button id="copyToListBtn" onclick="openListSelectorFromDetails('copy', '${type}', ${id})" style="background: #00d4aa; color: #000000; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600; flex: 1; transition: opacity 0.2s;" aria-label="Copy to list">
                        <span id="copyBtnText">📋 Copy to List</span>
                        <span id="copyBtnLoading" style="display: none; align-items: center; gap: 6px;" aria-live="polite">
                            <span class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-color: rgba(0,0,0,0.2); border-top-color: #000; display: inline-block; vertical-align: middle;" aria-hidden="true"></span>
                            Copying...
                        </span>
                    </button>
                    <button id="moveToListBtn" onclick="openListSelectorFromDetails('move', '${type}', ${id})" style="background: #4a90e2; color: #ffffff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600; flex: 1; transition: opacity 0.2s;" aria-label="Move to list">
                        <span id="moveBtnText">➡️ Move to List</span>
                        <span id="moveBtnLoading" style="display: none; align-items: center; gap: 6px;" aria-live="polite">
                            <span class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-color: rgba(255,255,255,0.3); border-top-color: #fff; display: inline-block; vertical-align: middle;" aria-hidden="true"></span>
                            Moving...
                        </span>
                    </button>
                </div>
                <div id="listMembershipDisplay" style="margin-top: 12px;">
                    ${listMembership.length > 0 ? `
                        <div style="color: #cccccc; font-size: 0.9em; margin-bottom: 8px;">Currently in lists:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${listMembership.map(list => `
                                <span style="background: ${list.color || '#4a90e2'}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                                    ${list.icon || '📋'} ${list.name}
                                </span>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="color: #999999; font-size: 0.9em; font-style: italic;">Not in any lists</div>
                    `}
                </div>
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
        ${listActionsSection}
        <div style="margin-top: 24px; text-align: center;">
            <button onclick="closeModal()" style="background: #00d4aa; color: #000000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 600;">Close</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Store modal scroll position
    window.detailsModalScrollPosition = 0;
    modalContent.addEventListener('scroll', () => {
        window.detailsModalScrollPosition = modalContent.scrollTop;
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Get list membership for an item
 * Returns array of lists that contain this item
 */
async function getItemListMembership(itemType, itemId) {
    try {
        const response = await fetch(`${API_BASE}/lists`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            console.error('Failed to fetch lists for membership check');
            return [];
        }
        
        const allLists = await response.json();
        const membership = [];
        
        // Check each list to see if it contains this item
        for (const list of allLists) {
            try {
                const itemsResponse = await fetch(`${API_BASE}/lists/${list.id}/items`, {
                    headers: getAuthHeaders()
                });
                
                if (itemsResponse.ok) {
                    const listItems = await itemsResponse.json();
                    
                    // Check if this item is in the list
                    const hasItem = listItems.some(item => 
                        item.item_type === itemType && item.item_id == itemId
                    );
                    
                    if (hasItem) {
                        membership.push({
                            id: list.id,
                            name: list.name,
                            icon: list.icon,
                            color: list.color || list.background_color
                        });
                    }
                }
            } catch (error) {
                console.error(`Error checking list ${list.id}:`, error);
            }
        }
        
        return membership;
    } catch (error) {
        console.error('Error getting list membership:', error);
        return [];
    }
}

/**
 * Open list selector from details modal
 * Maintains modal state and updates after operation
 */
async function openListSelectorFromDetails(operation, itemType, itemId) {
    // Get the source list ID (use 'personal' as default if not in a specific list)
    const sourceListId = window.currentListId || 'personal';
    
    // Show loading state on button
    const btnText = document.getElementById(operation === 'copy' ? 'copyBtnText' : 'moveBtnText');
    const btnLoading = document.getElementById(operation === 'copy' ? 'copyBtnLoading' : 'moveBtnLoading');
    const btn = document.getElementById(operation === 'copy' ? 'copyToListBtn' : 'moveToListBtn');
    
    if (btnText && btnLoading && btn) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.style.opacity = '0.7';
        btn.style.cursor = 'wait';
    }
    
    // Store current modal data for refresh
    window.detailsModalContext = { type: itemType, id: itemId };
    
    // Open the list selector modal
    await showListSelector(operation, itemId, itemType, sourceListId);
    
    // Reset button state
    if (btnText && btnLoading && btn) {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

/**
 * Refresh list membership display in details modal
 * Called after successful copy/move operations
 */
async function refreshDetailsModalListMembership() {
    if (!window.detailsModalContext) return;
    
    const { type, id } = window.detailsModalContext;
    const listMembershipDisplay = document.getElementById('listMembershipDisplay');
    
    if (!listMembershipDisplay) return;
    
    // Get updated list membership
    const listMembership = await getItemListMembership(type, id);
    
    // Update the display
    listMembershipDisplay.innerHTML = listMembership.length > 0 ? `
        <div style="color: #cccccc; font-size: 0.9em; margin-bottom: 8px;">Currently in lists:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${listMembership.map(list => `
                <span style="background: ${list.color || '#4a90e2'}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                    ${list.icon || '📋'} ${list.name}
                </span>
            `).join('')}
        </div>
    ` : `
        <div style="color: #999999; font-size: 0.9em; font-style: italic;">Not in any lists</div>
    `;
    
    // Restore scroll position
    const modalContent = document.querySelector('.modal-overlay > div');
    if (modalContent && window.detailsModalScrollPosition !== undefined) {
        modalContent.scrollTop = window.detailsModalScrollPosition;
    }
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
        
        // Reload watchlist to reflect changes
        loadWatchlist();
        
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
        
        // Add event listeners for item menu buttons
        document.querySelectorAll('.item-menu-btn').forEach(btn => {
            btn.onclick = function(e) {
                const itemId = btn.getAttribute('data-item-id');
                const itemType = btn.getAttribute('data-item-type');
                const listId = 1; // Default to main watchlist for now
                openItemMenu(itemId, itemType, listId, e);
            };
        });
        
        // Setup long-press gesture for mobile on watchlist rows
        document.querySelectorAll('.watchlist-row').forEach(row => {
            const menuBtn = row.querySelector('.item-menu-btn');
            if (menuBtn) {
                const itemId = menuBtn.getAttribute('data-item-id');
                const itemType = menuBtn.getAttribute('data-item-type');
                const listId = 1; // Default to main watchlist for now
                setupLongPressGesture(row, itemId, itemType, listId);
            }
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
}

// ===== BULK SELECTION MODE =====

// State for bulk selection
let bulkSelectionState = {
    active: false,
    selectedItems: [] // Array of {itemId, itemType, sourceListId}
};

// Toggle bulk selection mode
function toggleBulkSelectionMode() {
    if (bulkSelectionState.active) {
        exitBulkSelectionMode();
    } else {
        enterBulkSelectionMode();
    }
}

// Enter bulk selection mode
function enterBulkSelectionMode() {
    console.log('Entering bulk selection mode');
    bulkSelectionState.active = true;
    bulkSelectionState.selectedItems = [];
    
    // Add class to watchlist content to show checkboxes
    const watchlistContent = document.getElementById('watchlistContent');
    if (watchlistContent) {
        watchlistContent.classList.add('bulk-selection-mode');
        watchlistContent.setAttribute('aria-label', 'Bulk selection mode active. Click items to select them.');
    }
    
    // Update Select Items button appearance
    const selectItemsBtn = document.getElementById('selectItemsBtn');
    if (selectItemsBtn) {
        selectItemsBtn.classList.add('active');
        selectItemsBtn.innerHTML = '<span aria-hidden="true">✖️</span> Cancel Selection';
        selectItemsBtn.setAttribute('aria-label', 'Cancel bulk selection mode');
        selectItemsBtn.setAttribute('aria-pressed', 'true');
    }
    
    // Show bulk action bar
    const bulkActionBar = document.getElementById('bulkActionBar');
    if (bulkActionBar) {
        bulkActionBar.classList.add('show');
        bulkActionBar.setAttribute('role', 'toolbar');
        bulkActionBar.setAttribute('aria-label', 'Bulk actions toolbar');
    }
    
    // Add event listeners to all watchlist item checkboxes
    attachBulkSelectionListeners();
    
    // Update count
    updateBulkSelectionCount();
    
    // Announce to screen readers
    announceToScreenReader('Bulk selection mode activated. Click items to select them.');
}

// Exit bulk selection mode
function exitBulkSelectionMode() {
    console.log('Exiting bulk selection mode');
    bulkSelectionState.active = false;
    bulkSelectionState.selectedItems = [];
    
    // Remove class from watchlist content to hide checkboxes
    const watchlistContent = document.getElementById('watchlistContent');
    if (watchlistContent) {
        watchlistContent.classList.remove('bulk-selection-mode');
        watchlistContent.removeAttribute('aria-label');
    }
    
    // Update Select Items button appearance
    const selectItemsBtn = document.getElementById('selectItemsBtn');
    if (selectItemsBtn) {
        selectItemsBtn.classList.remove('active');
        selectItemsBtn.innerHTML = '<span aria-hidden="true">☑️</span> Select Items';
        selectItemsBtn.setAttribute('aria-label', 'Enter bulk selection mode');
        selectItemsBtn.setAttribute('aria-pressed', 'false');
    }
    
    // Hide bulk action bar
    const bulkActionBar = document.getElementById('bulkActionBar');
    if (bulkActionBar) {
        bulkActionBar.classList.remove('show');
        bulkActionBar.removeAttribute('role');
        bulkActionBar.removeAttribute('aria-label');
    }
    
    // Clear all selections
    document.querySelectorAll('.watchlist-row.selected').forEach(row => {
        row.classList.remove('selected');
        row.removeAttribute('aria-selected');
    });
    
    // Remove event listeners
    removeBulkSelectionListeners();
    
    // Announce to screen readers
    announceToScreenReader('Bulk selection mode deactivated.');
}

// Attach event listeners to checkboxes for bulk selection
function attachBulkSelectionListeners() {
    // Find all watchlist rows with checkboxes
    document.querySelectorAll('.watchlist-row').forEach(row => {
        row.addEventListener('click', handleBulkRowClick);
    });
}

// Remove event listeners from checkboxes
function removeBulkSelectionListeners() {
    document.querySelectorAll('.watchlist-row').forEach(row => {
        row.removeEventListener('click', handleBulkRowClick);
    });
}

// Handle row click in bulk selection mode
function handleBulkRowClick(e) {
    if (!bulkSelectionState.active) return;
    
    // Don't trigger if clicking on buttons or other interactive elements
    if (e.target.closest('button') || e.target.closest('.item-menu-btn') || e.target.closest('.expand-arrow')) {
        return;
    }
    
    const row = e.currentTarget;
    const itemId = row.getAttribute('data-item-id');
    const itemType = row.getAttribute('data-item-type');
    
    if (!itemId || !itemType) return;
    
    // Toggle selection
    const isSelected = row.classList.contains('selected');
    
    if (isSelected) {
        // Deselect
        row.classList.remove('selected');
        row.setAttribute('aria-selected', 'false');
        bulkSelectionState.selectedItems = bulkSelectionState.selectedItems.filter(
            item => !(item.itemId === itemId && item.itemType === itemType)
        );
    } else {
        // Select
        row.classList.add('selected');
        row.setAttribute('aria-selected', 'true');
        bulkSelectionState.selectedItems.push({
            itemId: itemId,
            itemType: itemType,
            sourceListId: getCurrentListId() // Get current list ID
        });
    }
    
    // Update count
    updateBulkSelectionCount();
}

// Update bulk selection count display
function updateBulkSelectionCount() {
    const countElement = document.getElementById('bulkSelectionCount');
    if (countElement) {
        const count = bulkSelectionState.selectedItems.length;
        countElement.textContent = count;
        countElement.setAttribute('aria-label', `${count} item${count !== 1 ? 's' : ''} selected`);
    }
}

// Announce message to screen readers using ARIA live region
function announceToScreenReader(message, priority = 'polite') {
    let announcer = document.getElementById('screenReaderAnnouncer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'screenReaderAnnouncer';
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.position = 'absolute';
        announcer.style.left = '-10000px';
        announcer.style.width = '1px';
        announcer.style.height = '1px';
        announcer.style.overflow = 'hidden';
        document.body.appendChild(announcer);
    }
    
    // Update aria-live priority if different
    if (announcer.getAttribute('aria-live') !== priority) {
        announcer.setAttribute('aria-live', priority);
    }
    
    // Clear and set new message
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = message;
    }, 100);
}

// Get current list ID (default to 1 for main watchlist)
function getCurrentListId() {
    // Check if we have a selected list
    const activeListChip = document.querySelector('.list-chip.active');
    if (activeListChip) {
        return parseInt(activeListChip.getAttribute('data-list-id')) || 1;
    }
    return 1; // Default to main watchlist
}

// Bulk copy selected items
async function bulkCopySelected() {
    if (bulkSelectionState.selectedItems.length === 0) {
        showError('No items selected');
        return;
    }
    
    // Show list selector modal for bulk copy
    showListSelector('copy', null, null, null, true);
}

// Bulk move selected items
async function bulkMoveSelected() {
    if (bulkSelectionState.selectedItems.length === 0) {
        showError('No items selected');
        return;
    }
    
    // Show list selector modal for bulk move
    showListSelector('move', null, null, null, true);
}

// Execute bulk copy operation
async function executeBulkCopyOperation(targetListId) {
    if (bulkSelectionState.selectedItems.length === 0) {
        showError('No items selected');
        return;
    }
    
    const sourceListId = getCurrentListId();
    const items = bulkSelectionState.selectedItems.map(item => ({
        item_id: parseInt(item.itemId),
        item_type: item.itemType
    }));
    
    // Cache operation details for potential retry
    const operationDetails = {
        type: 'bulkCopy',
        params: { targetListId, sourceListId, items }
    };
    operationCache.lastOperation = operationDetails;
    
    // Log operation start
    logOperation('BULK_COPY_START', {
        sourceListId,
        targetListId,
        itemCount: items.length
    });
    
    try {
        const itemCount = items.length;
        showLoading(`Copying ${itemCount} item${itemCount !== 1 ? 's' : ''}...`);
        
        const response = await fetch(`${API_BASE}/lists/bulk-operation`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                operation: 'copy',
                source_list_id: sourceListId,
                target_list_id: targetListId,
                items: items
            })
        });
        
        hideLoading();
        
        if (response.ok) {
            const result = await response.json();
            
            // Log success
            logOperation('BULK_COPY_SUCCESS', operationDetails.params, result);
            
            // Reset retry count on success
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
            
            let message = `${result.items_affected} items copied successfully`;
            if (result.duplicates_skipped > 0) {
                message += ` (${result.duplicates_skipped} duplicates skipped)`;
            }
            
            // Check for partial failures
            if (result.errors && result.errors.length > 0) {
                message += `\n⚠️ ${result.errors.length} items failed`;
                console.warn('Bulk copy partial failures:', result.errors);
                
                // Offer to retry failed items
                showWarning(`${message}. Check console for details.`);
            } else {
                showSuccess(message);
            }
            
            // Exit bulk selection mode
            exitBulkSelectionMode();
            
            // Reload watchlist
            loadWatchlist();
        } else {
            const error = await response.json();
            const errorInfo = categorizeError(new Error(error.detail || 'Failed to copy items'), response);
            
            // Log error
            logOperation('BULK_COPY_ERROR', operationDetails.params, null, new Error(errorInfo.message));
            
            // Show error with retry if recoverable
            if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
                showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
            } else {
                showError(errorInfo.message);
                operationCache.retryCount = 0;
                operationCache.lastOperation = null;
            }
        }
    } catch (error) {
        hideLoading();
        
        // Log error
        logOperation('BULK_COPY_EXCEPTION', operationDetails.params, null, error);
        
        // Categorize error
        const errorInfo = categorizeError(error);
        
        // Show error with retry if recoverable
        if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
            showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
        } else {
            showError(errorInfo.message);
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
        }
    }
}

// Execute bulk move operation
async function executeBulkMoveOperation(targetListId) {
    if (bulkSelectionState.selectedItems.length === 0) {
        showError('No items selected');
        return;
    }
    
    const sourceListId = getCurrentListId();
    const items = bulkSelectionState.selectedItems.map(item => ({
        item_id: parseInt(item.itemId),
        item_type: item.itemType
    }));
    
    // Cache operation details for potential retry
    const operationDetails = {
        type: 'bulkMove',
        params: { targetListId, sourceListId, items }
    };
    operationCache.lastOperation = operationDetails;
    
    // Log operation start
    logOperation('BULK_MOVE_START', {
        sourceListId,
        targetListId,
        itemCount: items.length
    });
    
    try {
        const itemCount = items.length;
        showLoading(`Moving ${itemCount} item${itemCount !== 1 ? 's' : ''}...`);
        
        const response = await fetch(`${API_BASE}/lists/bulk-operation`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                operation: 'move',
                source_list_id: sourceListId,
                target_list_id: targetListId,
                items: items
            })
        });
        
        hideLoading();
        
        if (response.ok) {
            const result = await response.json();
            
            // Log success
            logOperation('BULK_MOVE_SUCCESS', operationDetails.params, result);
            
            // Reset retry count on success
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
            
            // Store undo data for this bulk move operation
            undoMoveData = {
                sourceListId: sourceListId,
                targetListId: targetListId,
                items: items
            };
            
            // Clear any existing undo timeout
            if (undoTimeout) {
                clearTimeout(undoTimeout);
            }
            
            // Set timeout to clear undo data after 10 seconds
            undoTimeout = setTimeout(() => {
                undoMoveData = null;
                undoTimeout = null;
            }, 10000);
            
            let message = `${result.items_affected} items moved successfully`;
            if (result.duplicates_skipped > 0) {
                message += ` (${result.duplicates_skipped} duplicates skipped)`;
            }
            
            // Check for partial failures
            if (result.errors && result.errors.length > 0) {
                message += `\n⚠️ ${result.errors.length} items failed`;
                console.warn('Bulk move partial failures:', result.errors);
                
                // Show warning instead of success for partial failures
                showWarning(`${message}. Check console for details.`);
            } else {
                showSuccess(message, {
                    showUndo: true,
                    onUndo: () => undoMoveOperation(undoMoveData),
                    duration: 10000
                });
            }
            
            // Exit bulk selection mode
            exitBulkSelectionMode();
            
            // Reload watchlist
            loadWatchlist();
        } else {
            const error = await response.json();
            const errorInfo = categorizeError(new Error(error.detail || 'Failed to move items'), response);
            
            // Log error
            logOperation('BULK_MOVE_ERROR', operationDetails.params, null, new Error(errorInfo.message));
            
            // Show error with retry if recoverable
            if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
                showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
            } else {
                showError(errorInfo.message);
                operationCache.retryCount = 0;
                operationCache.lastOperation = null;
            }
        }
    } catch (error) {
        hideLoading();
        
        // Log error
        logOperation('BULK_MOVE_EXCEPTION', operationDetails.params, null, error);
        
        // Categorize error
        const errorInfo = categorizeError(error);
        
        // Show error with retry if recoverable
        if (errorInfo.recoverable && operationCache.retryCount < operationCache.maxRetries) {
            showErrorWithRetry(errorInfo.message, operationDetails, errorInfo.type);
        } else {
            showError(errorInfo.message);
            operationCache.retryCount = 0;
            operationCache.lastOperation = null;
        }
    }
}

// Force rebuild Thu Sep  4 16:07:12 EDT 2025
