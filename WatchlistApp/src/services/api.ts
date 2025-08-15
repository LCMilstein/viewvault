import {WatchlistData, ApiResponse} from '../types';

/**
 * API Service for communicating with the FastAPI backend
 * 
 * This service handles all network requests to your NAS backend.
 * Make sure to update the API_BASE URL to match your NAS IP address.
 * 
 * @example
 * // Update this to your NAS IP address
 * const API_BASE = 'http://192.168.1.100:8008/api';
 */
const API_BASE = 'http://192.168.1.100:8008/api'; // Update with your NAS IP

/**
 * ApiService class handles all backend communication
 * 
 * This class provides methods to:
 * - Authenticate users and manage JWT tokens
 * - Fetch watchlist data from your NAS
 * - Toggle watched status for movies and series
 * - Save notes for items
 * - Delete items from watchlist
 * 
 * All methods return a standardized ApiResponse<T> format with either
 * data or error properties.
 */
class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Load token from storage on initialization
    this.loadToken();
  }

  /**
   * Load JWT token from storage
   */
  private async loadToken() {
    try {
      // For React Native, we'll use a simple approach for now
      // In a real app, you'd use AsyncStorage or SecureStore
      // For now, we'll just check if there's a token in memory
      this.token = null;
    } catch (error) {
      // Handle error silently for now
      this.token = null;
    }
  }

  /**
   * Save JWT token to storage
   */
  private async saveToken(token: string) {
    try {
      this.token = token;
      // For React Native, we'll use a simple approach for now
      // In a real app, you'd use AsyncStorage or SecureStore
    } catch (error) {
      // Handle error silently for now
    }
  }

  /**
   * Clear stored JWT token
   */
  private async clearToken() {
    try {
      this.token = null;
      // For React Native, we'll use a simple approach for now
      // In a real app, you'd use AsyncStorage or SecureStore
    } catch (error) {
      // Handle error silently for now
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

  /**
   * Authenticate user with username and password
   * 
   * @param username - User's username
   * @param password - User's password
   * @returns Promise<ApiResponse<{access_token: string, token_type: string}>> - Authentication response
   * 
   * @example
   * const response = await apiService.login('username', 'password');
   * if (response.data) {
   *   console.log('Login successful');
   * } else {
   *   console.error('Login failed:', response.error);
   * }
   */
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

  /**
   * Register a new user
   * 
   * @param username - New user's username
   * @param email - New user's email
   * @param password - New user's password
   * @returns Promise<ApiResponse<{access_token: string, token_type: string}>> - Registration response
   * 
   * @example
   * const response = await apiService.register('newuser', 'user@example.com', 'password');
   * if (response.data) {
   *   console.log('Registration successful');
   * } else {
   *   console.error('Registration failed:', response.error);
   * }
   */
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

  /**
   * Logout user and clear stored token
   */
  async logout(): Promise<void> {
    await this.clearToken();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Generic request method that handles all HTTP requests
   * 
   * @param endpoint - API endpoint (e.g., '/watchlist', '/movies/123/toggle')
   * @param options - Fetch options (method, headers, body, etc.)
   * @returns Promise<ApiResponse<T>> - Standardized response format
   * 
   * @example
   * const response = await this.request<WatchlistData>('/watchlist');
   * if (response.error) {
   *   console.error('API Error:', response.error);
   * } else {
   *   console.log('Data:', response.data);
   * }
   */
  private async request<T>(
    endpoint: string,
    options: any = {},
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          await this.clearToken();
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {data};
    } catch (error) {
      return {error: error instanceof Error ? error.message : 'Unknown error'};
    }
  }

  /**
   * Fetch the complete watchlist from your NAS
   * 
   * This method retrieves all movies, series, and collections
   * from your FastAPI backend. The data includes:
   * - Movies with poster URLs, release dates, and watched status
   * - Series with episode lists and watched status
   * - Collections with grouped movies
   * 
   * @returns Promise<ApiResponse<WatchlistData>> - Complete watchlist data
   * 
   * @example
   * const response = await apiService.getWatchlist();
   * if (response.data) {
   *   setWatchlistData(response.data);
   * }
   */
  async getWatchlist(): Promise<ApiResponse<WatchlistData>> {
    return this.request<WatchlistData>('/watchlist');
  }

  /**
   * Toggle the watched status of a movie or series
   * 
   * This method sends a POST request to toggle the watched status.
   * For movies: toggles the entire movie as watched/unwatched
   * For series: toggles the entire series (all episodes)
   * 
   * @param type - 'movie' or 'series'
   * @param id - The unique identifier for the item
   * @returns Promise<ApiResponse<void>> - Success/error response
   * 
   * @example
   * const response = await apiService.toggleWatched('movie', 'tt1234567');
   * if (response.error) {
   *   Alert.alert('Error', response.error);
   * }
   */
  async toggleWatched(
    type: 'movie' | 'series',
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/${type}/${id}/toggle`, {
      method: 'POST',
    });
  }

  /**
   * Toggle the watched status of a specific episode
   * 
   * This method is used for series episodes. It allows you to
   * mark individual episodes as watched/unwatched within a series.
   * 
   * @param seriesId - The series identifier
   * @param seasonNumber - Season number (1, 2, 3, etc.)
   * @param episodeNumber - Episode number within the season
   * @returns Promise<ApiResponse<void>> - Success/error response
   * 
   * @example
   * const response = await apiService.toggleEpisodeWatched('tt1234567', 1, 5);
   * // This toggles episode 5 of season 1
   */
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

  /**
   * Save notes for a movie, series, or episode
   * 
   * This method allows you to add or update notes for any item
   * in your watchlist. Notes are stored as plain text.
   * 
   * @param type - 'movie', 'series', or 'episode'
   * @param id - The unique identifier for the item
   * @param notes - The notes text to save
   * @returns Promise<ApiResponse<void>> - Success/error response
   * 
   * @example
   * const response = await apiService.saveNotes('movie', 'tt1234567', 'Great movie!');
   * if (response.error) {
   *   Alert.alert('Error', response.error);
   * }
   */
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

  /**
   * Delete an item from the watchlist
   * 
   * This method permanently removes a movie or series from your watchlist.
   * This action cannot be undone.
   * 
   * @param type - 'movie' or 'series'
   * @param id - The unique identifier for the item
   * @returns Promise<ApiResponse<void>> - Success/error response
   * 
   * @example
   * const response = await apiService.deleteItem('movie', 'tt1234567');
   * if (response.error) {
   *   Alert.alert('Error', response.error);
   * }
   */
  async deleteItem(
    type: 'movie' | 'series',
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/${type}/${id}`, {
      method: 'DELETE',
    });
  }

  // Generic HTTP methods for list management
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