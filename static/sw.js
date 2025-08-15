// Service Worker for CineSync Offline Functionality
const CACHE_NAME = 'cinesync-v1';
const OFFLINE_CACHE = 'cinesync-offline-v1';

// Files to cache for offline functionality
const CACHE_FILES = [
    '/',
    '/static/index.html',
    '/static/app.js',
    '/static/login.html',
    '/static/no-image.png'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching essential files');
                return cache.addAll(CACHE_FILES);
            })
            .then(() => {
                console.log('[SW] Service worker installed successfully');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Service worker activated');
            return self.clients.claim();
        })
    );
});

// Fetch event - handle offline/online requests
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle static files
    if (request.method === 'GET') {
        event.respondWith(handleStaticRequest(request));
        return;
    }
});

// Handle API requests with offline support
async function handleApiRequest(request) {
    try {
        // Try network first for API requests
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful API responses
            const cache = await caches.open(OFFLINE_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', error);
    }

    // Fallback to cache for API requests
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    // Return offline response for API requests
    return new Response(JSON.stringify({ error: 'Offline - data not available' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Handle static file requests
async function handleStaticRequest(request) {
    // Try cache first for static files
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        // Fallback to network
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // Cache the response for future offline use
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed for static file:', error);
        // Return offline page for navigation requests
        if (request.destination === 'document') {
            return caches.match('/static/index.html');
        }
    }
}

// Background sync for offline changes
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-watchlist-changes') {
        event.waitUntil(syncWatchlistChanges());
    }
});

// Sync queued watchlist changes
async function syncWatchlistChanges() {
    try {
        // Get queued changes from IndexedDB
        const db = await openDB();
        const changes = await db.getAll('pendingChanges');
        
        if (changes.length === 0) {
            console.log('[SW] No pending changes to sync');
            return;
        }

        console.log('[SW] Syncing', changes.length, 'pending changes');

        // Process each change
        for (const change of changes) {
            try {
                const response = await fetch(change.url, {
                    method: change.method,
                    headers: change.headers,
                    body: change.body
                });

                if (response.ok) {
                    // Remove from pending changes
                    await db.delete('pendingChanges', change.id);
                    console.log('[SW] Successfully synced change:', change.id);
                } else {
                    console.log('[SW] Failed to sync change:', change.id, response.status);
                }
            } catch (error) {
                console.log('[SW] Error syncing change:', change.id, error);
            }
        }

        // Notify clients that sync is complete
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                success: true
            });
        });

    } catch (error) {
        console.log('[SW] Error in background sync:', error);
    }
}

// Open IndexedDB for offline storage
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('CineSyncDB', 1);
        
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

// Handle messages from the main app
self.addEventListener('message', (event) => {
    console.log('[SW] Received message:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
}); 