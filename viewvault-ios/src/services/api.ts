import {WatchlistData, ApiResponse} from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default to LAN backend to avoid Cloudflare timeouts during development
const API_BASE = 'https://wlapp.umpyours.com/api';

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Load token from storage when service is initialized
    this.loadToken();
    this.loadStoredBaseUrl();
  }

  /**
   * Load stored base URL from AsyncStorage
   */
  private async loadStoredBaseUrl() {
    try {
      const storedBaseUrl = await AsyncStorage.getItem('server_endpoint');
      if (storedBaseUrl) {
        this.baseUrl = storedBaseUrl;
        console.log('Loaded base URL from storage:', storedBaseUrl);
      }
    } catch (error) {
      console.error('Error loading base URL from storage:', error);
    }
  }

  /**
   * Update the base URL at runtime
   */
  updateBaseUrl(newBaseUrl: string) {
    console.log('Updating base URL from', this.baseUrl, 'to', newBaseUrl);
    this.baseUrl = newBaseUrl;
  }

  setAccessToken(token: string) {
    console.log('Setting access token:', token ? 'exists' : 'null');
    this.token = token;
  }

  clearAccessToken() {
    console.log('Clearing access token');
    this.token = null;
    // Also clear from AsyncStorage
    AsyncStorage.removeItem('access_token').catch(error => {
      console.error('Error clearing token from AsyncStorage:', error);
    });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const authenticated = this.token !== null;
    console.log('isAuthenticated check:', authenticated, 'token:', this.token ? 'exists' : 'null');
    return authenticated;
  }

  /**
   * Get the current token for debugging
   */
  getCurrentToken(): string | null {
    return this.token;
  }

  /**
   * Load JWT token from storage
   */
  private async loadToken() {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      if (storedToken) {
        this.token = storedToken;
        console.log('Loaded token from storage:', storedToken ? 'exists' : 'null');
      }
    } catch (error) {
      console.error('Error loading token from storage:', error);
      this.token = null;
    }
  }

  /**
   * Save JWT token to storage
   */
  private async saveToken(token: string) {
    try {
      console.log('Saving token:', token ? 'exists' : 'null');
      this.token = token;
      await AsyncStorage.setItem('access_token', token);
      console.log('Token saved to AsyncStorage');
    } catch (error) {
      console.error('Error saving token to storage:', error);
    }
  }

  /**
   * Clear stored JWT token
   */
  private async clearToken() {
    try {
      this.token = null;
      await AsyncStorage.removeItem('access_token');
      console.log('Token cleared from AsyncStorage');
    } catch (error) {
      console.error('Error clearing token from storage:', error);
    }
  }

  /**
   * Get authentication headers for requests
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      console.log(`Making API request to: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers,
        },
        ...options,
      });

      console.log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          await this.clearToken();
          throw new Error('Authentication required. Please log in again.');
        }
        
        const errorText = await response.text();
        console.error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        
        // Try to parse the error response for more specific error messages
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          // If we can't parse the error response, use the raw text
          if (errorText && errorText.trim()) {
            errorMessage = errorText.trim();
          }
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return {data};
    } catch (error) {
      console.error('API request failed:', error);
      return {error: error instanceof Error ? error.message : 'Unknown error'};
    }
  }

  async login(username: string, password: string): Promise<ApiResponse<{access_token: string, token_type: string}>> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      await this.saveToken(data.access_token);
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async register(username: string, email: string, password: string): Promise<ApiResponse<{access_token: string, token_type: string}>> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      await this.saveToken(data.access_token);
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getWatchlist(): Promise<ApiResponse<WatchlistData>> {
    return this.request<WatchlistData>('/watchlist');
  }

  async getWatchlistWithSort(sort?: string, filter?: string): Promise<ApiResponse<WatchlistData>> {
    let endpoint = '/watchlist';
    const params = new URLSearchParams();
    
    if (sort) {
      // Handle different sort parameter formats
      // The backend might expect different parameter names
      if (sort === 'runtime') {
        params.append('sort', 'runtime');
      } else if (sort === '-runtime') {
        params.append('sort', '-runtime');
      } else if (sort === 'title') {
        params.append('sort', 'title');
      } else if (sort === '-title') {
        params.append('sort', '-title');
      } else if (sort === 'date') {
        params.append('sort', 'date');
      } else if (sort === '-date') {
        params.append('sort', '-date');
      } else {
        // Try the original format
        params.append('sort', sort);
      }
    }
    
    if (filter) {
      // Handle different filter parameter formats
      if (filter.includes('unwatched')) {
        params.append('filter', 'unwatched');
      } else if (filter.includes('watched')) {
        params.append('filter', 'watched');
      } else {
        params.append('filter', filter);
      }
    }
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    console.log('=== API Request ===');
    console.log('Endpoint:', endpoint);
    console.log('Sort parameter:', sort);
    console.log('Filter parameter:', filter);
    console.log('Full URL:', `${this.baseUrl}${endpoint}`);
    console.log('==================');
    
    return this.request<WatchlistData>(endpoint);
  }

  async toggleWatched(
    type: 'movie' | 'series',
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/${type}/${id}/toggle`, {
      method: 'POST',
    });
  }

  async toggleMovieWatched(movieId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/movie/${movieId}/toggle`, {
      method: 'POST',
    });
  }

  async toggleEpisodeWatched(
    seriesId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(
      `/series/${seriesId}/episodes/${seasonNumber}/${episodeNumber}/toggle`,
      {
        method: 'POST',
      },
    );
  }

  async saveNotes(
    type: 'movie' | 'series' | 'episode',
    id: string,
    notes: string,
  ): Promise<ApiResponse<void>> {
    const endpoint = type === 'episode' ? `/episodes/${id}/notes` : `/${type}s/${id}/notes`;
    return this.request<void>(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: notes,
    });
  }

  async deleteItem(
    type: 'movie' | 'series',
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/${type}/${id}`, {
      method: 'DELETE',
    });
  }

  // Search external databases (TMDB/IMDb)
  async searchExternal(query: string, type: 'movie' | 'series' = 'movie'): Promise<ApiResponse<any[]>> {
    try {
      console.log(`Searching ${type} for: "${query}"`);
      
      // Use the correct endpoints that already exist on the backend
      // Note: 'series' should map to 'series' endpoint, not 'seriess'
      const endpoint = `/search/${type === 'series' ? 'series' : 'movies'}/?query=${encodeURIComponent(query)}`;
      console.log(`Using endpoint: ${endpoint}`);
      
      const response = await this.request<any>(endpoint);
      console.log(`Search response:`, response);
      
      // Handle different response formats
      if (response.data) {
        // If response.data is an array, return it directly
        if (Array.isArray(response.data)) {
          return {data: response.data};
        }
        // If response.data has a results property (common API pattern)
        if (response.data && typeof response.data === 'object' && 'results' in response.data && Array.isArray(response.data.results)) {
          return {data: response.data.results};
        }
        // If response.data has a data property
        if (response.data && typeof response.data === 'object' && 'data' in response.data && Array.isArray(response.data.data)) {
          return {data: response.data.data};
        }
        // If response.data is an object with items
        if (response.data && typeof response.data === 'object' && 'items' in response.data && Array.isArray(response.data.items)) {
          return {data: response.data.items};
        }
      }
      
      // If we get here, the response format is unexpected
      console.log('Unexpected search response format:', response);
      return {error: 'Unexpected response format from search API'};
    } catch (error) {
      console.error(`Search failed for ${type}:`, error);
      return {error: error instanceof Error ? error.message : 'Search failed'};
    }
  }

  // Import item from external database
  async importItem(
    externalId: string,
    type: 'movie' | 'series',
    targetListIds?: string[]
  ): Promise<ApiResponse<void>> {
    try {
      console.log(`Importing ${type} with ID: ${externalId} to lists:`, targetListIds);
      
      // Use the correct endpoints that already exist on the backend
      const endpoint = `/import/${type}/${externalId}`;
      console.log(`Using import endpoint: ${endpoint}`);
      
      // Send target_list_ids if provided
      const payload = targetListIds ? { target_list_ids: targetListIds } : {};
      
      const response = await this.request<void>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log(`Import response:`, response);
      return response;
    } catch (error) {
      console.error(`Import failed for ${type}:`, error);
      return {error: error instanceof Error ? error.message : 'Import failed'};
    }
  }

  // Jellyfin integration
  async getJellyfinLibraries(): Promise<ApiResponse<any[]>> {
    try {
      console.log('Getting Jellyfin libraries...');
      const response = await this.request<any[]>('/import/jellyfin/libraries-debug');
      console.log('Jellyfin libraries response:', response);
      return response;
    } catch (error) {
      console.error('Failed to get Jellyfin libraries:', error);
      return {error: error instanceof Error ? error.message : 'Failed to get libraries'};
    }
  }

  async importFromJellyfin(libraryName: string): Promise<ApiResponse<any>> {
    try {
      console.log(`Importing from Jellyfin library: ${libraryName}`);
      const response = await this.request<any>('/import/jellyfin/', {
        method: 'POST',
        body: JSON.stringify({ library_name: libraryName }),
      });
      console.log('Jellyfin import response:', response);
      
      // Check if the response contains an error in the backend's format
      if (response.data && Array.isArray(response.data) && response.data.length === 2) {
        const [errorObj, statusCode] = response.data;
        if (errorObj && errorObj.error && statusCode >= 400) {
          return {error: `Backend error: ${errorObj.error}`};
        }
      }
      
      return response;
    } catch (error) {
      console.error('Jellyfin import failed:', error);
      return {error: error instanceof Error ? error.message : 'Import failed'};
    }
  }

  // ======================
  // USER PROFILE API
  // ======================
  
  async getProfile(): Promise<ApiResponse<{id: number, username: string, email: string, is_admin: boolean}>> {
    return this.request<{id: number, username: string, email: string, is_admin: boolean}>('/auth/me');
  }

  // ======================
  // MULTI-LIST SYSTEM API
  // ======================

  async getLists(): Promise<ApiResponse<{
    user_lists: any[];
    shared_lists: any[];
    personal_list: any;
  }>> {
    return this.request<{
      user_lists: any[];
      shared_lists: any[];
      personal_list: any;
    }>('/lists');
  }

  async createList(data: {
    name: string;
    description?: string;
    color?: string;
    background_color?: string;
    icon?: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>('/lists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateList(listId: string, data: {
    name?: string;
    description?: string;
    color?: string;
    background_color?: string;
    icon?: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/lists/${listId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteList(listId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/lists/${listId}`, {
      method: 'DELETE',
    });
  }

  // List sharing
  async shareList(listId: string, data: {
    shared_with_username: string;
    permission_level: 'view' | 'edit';
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/lists/${listId}/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async unshareList(listId: string, data: {
    shared_with_username: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/lists/${listId}/unshare`, {
      method: 'DELETE',
      body: JSON.stringify(data),
    });
  }

  // List items management
  async getListItems(listId: string): Promise<ApiResponse<WatchlistData>> {
    return this.request<WatchlistData>(`/lists/${listId}/items`);
  }

  async addToList(listId: string, data: {
    item_type: 'movie' | 'series';
    item_id: number;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeFromList(listId: string, itemId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/lists/${listId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  // Remove item from collection (collection is treated as a list)
  async removeFromCollection(collectionId: string, itemId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/collections/${collectionId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async updateListItemWatched(listId: string, itemId: string, data: {
    watched: boolean;
    watched_by?: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/lists/${listId}/items/${itemId}/watched`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ======================
  // ENHANCED CONTENT API
  // ======================

  async getMovie(movieId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/movies/${movieId}`);
  }

  async updateMovie(movieId: string, data: {
    watched?: boolean;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/movies/${movieId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateMovieWatched(movieId: string, data: {
    watched: boolean;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/movies/${movieId}/watched`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getSeries(seriesId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/series/${seriesId}`);
  }

  async updateEpisodeWatched(episodeId: string, data: {
    watched: boolean;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/episodes/${episodeId}/watched`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ======================
  // ENHANCED SEARCH API
  // ======================

  async searchAll(query: string): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/search/all/?query=${encodeURIComponent(query.trim())}`);
  }

  // ======================
  // ENHANCED IMPORT API
  // ======================

  async importMovieById(imdbId: string, targetListIds?: string[]): Promise<ApiResponse<any>> {
    const payload = targetListIds ? { target_list_ids: targetListIds } : {};
    return this.request<any>(`/import/movie/${imdbId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async importMovieWithSequels(imdbId: string, targetListIds?: string[]): Promise<ApiResponse<any>> {
    const payload = targetListIds ? { target_list_ids: targetListIds } : {};
    return this.request<any>(`/import/movie/${imdbId}/sequels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async importSeriesById(imdbId: string, targetListIds?: string[]): Promise<ApiResponse<any>> {
    const payload = targetListIds ? { target_list_ids: targetListIds } : {};
    return this.request<any>(`/import/series/${imdbId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async importSeriesFull(imdbId: string, targetListIds?: string[]): Promise<ApiResponse<any>> {
    const payload = targetListIds ? { target_list_ids: targetListIds } : {};
    return this.request<any>(`/import/series/${imdbId}/full`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async importByUrl(data: {
    url: string;
  }): Promise<ApiResponse<any>> {
    return this.request<any>('/import/by_url/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Enhanced Jellyfin with list selection
  async getJellyfinLibrariesNew(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/import/jellyfin/libraries');
  }

  async importFromJellyfinToLists(data: {
    library_name: string;
    target_list_ids: string[];
  }): Promise<ApiResponse<any>> {
    // include legacy key for backend compatibility
    const payload: any = {
      library_name: data.library_name,
      target_list_ids: data.target_list_ids,
      list_ids: data.target_list_ids,
    };
    return this.request<any>('/import/jellyfin/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ======================
  // NOTIFICATIONS API
  // ======================

  async getNewReleasesCount(): Promise<ApiResponse<{count: number}>> {
    return this.request<{count: number}>('/notifications/new-releases');
  }

  async getNewReleasesDetails(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/notifications/details');
  }

  async markNotificationsSeen(): Promise<ApiResponse<void>> {
    return this.request<void>('/notifications/mark-seen', {
      method: 'POST',
    });
  }

  // ======================
  // ADMIN API (Admin Users Only)
  // ======================

  async getUsers(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/admin/users');
  }

  async getUser(userId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/users/${userId}`);
  }

  async updateUser(userId: string, data: {
    username?: string;
    email?: string;
    is_admin?: boolean;
  }): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async clearUserData(userId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/users/${userId}/clear-data`, {
      method: 'POST',
    });
  }

  async deleteUser(userId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async getAdminDashboard(): Promise<ApiResponse<any>> {
    return this.request<any>('/admin/dashboard');
  }

  // ======================
  // GENERIC HTTP METHODS (for backward compatibility)
  // ======================

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export default new ApiService(API_BASE); 