/**
 * TypeScript type definitions for the WatchlistApp
 * 
 * These interfaces define the data structures used throughout the app.
 * They match the data format returned by the FastAPI backend.
 */

/**
 * Movie interface - represents a single movie in the watchlist
 * 
 * Contains all the information needed to display and manage a movie:
 * - Basic info (id, title, release date)
 * - IMDB integration (imdb_id)
 * - Watch status and tracking
 * - Media quality and runtime
 * - Poster images for display
 * - Optional notes and collection grouping
 * 
 * @example
 * {
 *   id: "tt0468569",
 *   title: "The Dark Knight",
 *   imdb_id: "tt0468569",
 *   release_date: "2008-07-18",
 *   watched: false,
 *   type: "movie",
 *   poster_url: "https://example.com/poster.jpg",
 *   poster_thumb: "https://example.com/thumb.jpg",
 *   runtime: 152,
 *   quality: "4K",
 *   notes: "Great movie!"
 * }
 */
export interface Movie {
  id: string;
  title: string;
  imdb_id: string;
  release_date: string;
  watched: boolean;
  type: string;
  collection_id?: string;
  collection_title?: string;
  poster_url: string;
  poster_thumb: string;
  runtime?: number;
  quality?: string;
  notes?: string;
}

/**
 * Episode interface - represents a single episode in a series
 * 
 * Contains episode-specific information including:
 * - Season and episode numbers
 * - Air date and title
 * - Watch status and optional notes
 * - Links to parent series
 * 
 * @example
 * {
 *   id: "tt1234567_s01e01",
 *   series_id: "tt1234567",
 *   season: 1,
 *   episode: 1,
 *   title: "Pilot",
 *   code: "S01E01",
 *   air_date: "2023-01-15",
 *   watched: false,
 *   notes: "Great pilot episode"
 * }
 */
export interface Episode {
  id: string;
  series_id: string;
  season: number;
  episode: number;
  title: string;
  code: string;
  air_date?: string;
  watched: boolean;
  notes?: string;
}

/**
 * Series interface - represents a TV series in the watchlist
 * 
 * Contains series information and a list of episodes:
 * - Basic series info (title, IMDB ID, poster)
 * - Episode list with individual watch status
 * - Average episode runtime
 * - Optional notes for the series
 * 
 * @example
 * {
 *   id: "tt1234567",
 *   title: "Breaking Bad",
 *   imdb_id: "tt0903747",
 *   poster_url: "https://example.com/poster.jpg",
 *   average_episode_runtime: 47,
 *   notes: "Amazing series",
 *   episodes: [episode1, episode2, ...]
 * }
 */
export interface Series {
  id: string;
  title: string;
  imdb_id: string;
  poster_url: string;
  average_episode_runtime?: number;
  notes?: string;
  episodes: Episode[];
}

/**
 * Collection interface - represents a group of related movies
 * 
 * Collections allow grouping movies together (e.g., Marvel Cinematic Universe).
 * Contains a title and list of movies that belong to the collection.
 * 
 * @example
 * {
 *   id: "marvel_cinematic_universe",
 *   title: "Marvel Cinematic Universe",
 *   items: [movie1, movie2, movie3, ...]
 * }
 */
export interface Collection {
  id: string;
  title: string;
  poster_url?: string;
  notes?: string;
  items: Movie[];
}

/**
 * WatchlistData interface - complete watchlist structure
 * 
 * This is the main data structure returned by the backend API.
 * It contains all movies, series, and collections in the user's watchlist.
 * 
 * The structure allows for:
 * - Individual movies not in collections
 * - TV series with episode lists
 * - Movie collections for grouped content
 * 
 * @example
 * {
 *   collections: [collection1, collection2],
 *   series: [series1, series2],
 *   movies: [movie1, movie2, movie3]
 * }
 */
export interface WatchlistData {
  collections: Collection[];
  series: Series[];
  movies: Movie[];
}

/**
 * ApiResponse interface - standardized API response format
 * 
 * All API calls return this standardized format to handle
 * both successful responses and errors consistently.
 * 
 * - data: Contains the response data when successful
 * - error: Contains error message when the request fails
 * 
 * @example
 * // Success response
 * {
 *   data: { movies: [...], series: [...], collections: [...] }
 * }
 * 
 * // Error response
 * {
 *   error: "Failed to connect to server"
 * }
 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
} 