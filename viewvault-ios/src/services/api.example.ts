import {WatchlistData, ApiResponse} from '../types';

// Copy this file to api.ts and update the IP address below
const API_BASE = 'http://192.168.1.100:8008/api'; // Replace with your NAS IP

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {data};
    } catch (error) {
      console.error('API request failed:', error);
      return {error: error instanceof Error ? error.message : 'Unknown error'};
    }
  }

  async getWatchlist(): Promise<ApiResponse<WatchlistData>> {
    return this.request<WatchlistData>('/watchlist');
  }

  async toggleWatched(
    type: 'movie' | 'series',
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/watchlist/${type}/${id}/toggle`, {
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
}

export default new ApiService(API_BASE); 