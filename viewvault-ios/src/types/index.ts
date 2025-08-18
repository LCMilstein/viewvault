// ======================
// USER & AUTH TYPES
// ======================

export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// ======================
// CONTENT TYPES
// ======================

export interface Movie {
  id: string;
  user_id?: number;
  title: string;
  imdb_id: string;
  release_date: string;
  runtime?: number;
  watched: boolean;
  type: string;
  collection_id?: number;
  collection_name?: string;
  poster_url: string;
  poster_thumb: string;
  is_new: boolean;
  quality?: string;
  overview?: string;
  notes?: string;
  added_at: string;
  deleted?: boolean;
}

export interface Episode {
  id: string;
  series_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  air_date?: string;
  watched: boolean;
  overview?: string;
  notes?: string;
  deleted?: boolean;
}

export interface Series {
  id: string;
  user_id?: number;
  title: string;
  imdb_id: string;
  type: string;
  poster_url: string;
  poster_thumb: string;
  is_new: boolean;
  average_episode_runtime?: number;
  notes?: string;
  deleted?: boolean;
  added_at: string;
  episodes: Episode[];
}

export interface Collection {
  id: number;
  title: string;
  poster_url?: string;
  overview?: string;
  items: Movie[];
}

export interface WatchlistData {
  collections: Collection[];
  series: Series[];
  movies: Movie[];
}

// ======================
// LIST SYSTEM TYPES  
// ======================

export interface List {
  id: string;
  user_id?: number;
  name: string;
  description?: string;
  type: 'personal' | 'custom' | 'shared';
  color?: string;
  background_color?: string;
  icon?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  deleted?: boolean;
  // UI-specific properties
  isActive?: boolean;
  itemCount?: number;
  createdAt?: Date;
  // Sharing properties
  owner_username?: string;
  permission_level?: 'view' | 'edit';
}

export interface ListItem {
  id: string;
  list_id: string;
  item_type: 'movie' | 'series';
  item_id: number;
  watched: boolean;
  watched_by?: string; // 'you', 'family', 'both'
  watched_at?: string;
  added_at: string;
  notes?: string;
  deleted?: boolean;
}

export interface ListPermission {
  id: string;
  list_id: string;
  shared_with_user_id: number;
  permission_level: 'view' | 'edit';
  created_at: string;
  deleted?: boolean;
}

export interface ListsResponse {
  user_lists: List[];
  shared_lists: List[];
  personal_list: List;
}

// ======================
// SEARCH & IMPORT TYPES
// ======================

export interface SearchResult {
  title: string;
  imdb_id: string;
  release_date?: string;
  poster_url?: string;
  type: 'movie' | 'series';
  overview?: string;
}

export interface JellyfinLibrary {
  id: string;
  name: string;
  type: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  details?: string;
}

// ======================
// NOTIFICATION TYPES
// ======================

export interface NotificationCount {
  count: number;
}

export interface NotificationDetail {
  id: string;
  type: 'new_sequel' | 'new_episode';
  title: string;
  description: string;
  item_id: string;
  item_type: 'movie' | 'series';
  created_at: string;
}

// ======================
// ADMIN TYPES
// ======================

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
  watchlist_count?: number;
}

export interface AdminDashboard {
  total_users: number;
  active_users: number;
  total_movies: number;
  total_series: number;
  total_lists: number;
  recent_registrations: AdminUser[];
  recent_activity: any[];
}

// ======================
// LEGACY COMPATIBILITY
// ======================

export interface WatchlistItem extends Movie {
  listId: string;
  listType: 'movie' | 'series' | 'collection';
  collection?: Collection;
}

// ======================
// API RESPONSE TYPES
// ======================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
} 