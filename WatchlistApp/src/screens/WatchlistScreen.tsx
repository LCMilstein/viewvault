import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import WatchlistItem from '../components/WatchlistItem';
import apiService from '../services/api';
import {WatchlistData, Movie, Series, Collection} from '../types';
import {RootStackParamList} from '../../App';

type WatchlistScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Watchlist'>;

/**
 * WatchlistScreen - Main screen displaying all watchlist items
 * 
 * This screen is the primary interface for viewing and managing your watchlist.
 * It displays movies, series, and collections in a scrollable list with
 * pull-to-refresh functionality and filtering capabilities.
 * 
 * Features:
 * - Displays all watchlist items (movies, series, collections)
 * - Pull-to-refresh to update data from NAS
 * - Toggle watched status for items
 * - Delete items from watchlist
 * - Navigate to details screen
 * - Filter by type (movies/series), watched status, and runtime
 * - Error handling and loading states
 * 
 * @example
 * <WatchlistScreen />
 */
const WatchlistScreen: React.FC = () => {
  const navigation = useNavigation<WatchlistScreenNavigationProp>();
  
  // State management for the screen
  const [watchlistData, setWatchlistData] = useState<WatchlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state management
  const [filters, setFilters] = useState({
    movies: true,
    series: true,
    unwatched: false,
    runtime: 'all' as 'all' | 'short' | 'standard' | 'long' | 'epic'
  });

  /**
   * Load watchlist data from the NAS backend
   * 
   * This function fetches the complete watchlist data including:
   * - Movies with poster URLs and watched status
   * - Series with episode lists
   * - Collections with grouped movies
   * 
   * The function handles loading states and error conditions.
   * 
   * @example
   * await loadWatchlist();
   */
  const loadWatchlist = async () => {
    try {
      setError(null);
      const response = await apiService.getWatchlist();
      
      if (response.error) {
        // Check if it's an authentication error
        if (response.error.includes('Authentication required')) {
          // Redirect to login screen
          navigation.replace('Login');
          return;
        }
        setError(response.error);
        return;
      }
      
      if (response.data) {
        setWatchlistData(response.data);
      }
    } catch (err) {
      setError('Failed to load watchlist');
      console.error('Error loading watchlist:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load data when component mounts
  useEffect(() => {
    loadWatchlist();
  }, []);

  /**
   * Handle pull-to-refresh gesture
   * 
   * This function is called when the user pulls down to refresh
   * the watchlist. It sets the refreshing state and reloads data.
   * 
   * @example
   * <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
   */
  const onRefresh = () => {
    setRefreshing(true);
    loadWatchlist();
  };

  /**
   * Navigate to the details screen for a specific item
   * 
   * This function determines the item type and navigates to the
   * details screen with the appropriate parameters.
   * 
   * @param item - The movie, series, or collection to view details for
   * 
   * @example
   * handleItemPress(movieItem);
   */
  const handleItemPress = (item: Movie | Series | Collection) => {
    let type: 'movie' | 'series' | 'collection';
    let id: string;

    if ('items' in item) {
      type = 'collection';
      id = item.id;
    } else if ('episodes' in item) {
      type = 'series';
      id = item.id;
    } else {
      type = 'movie';
      id = item.id;
    }

    navigation.navigate('Details', {itemId: id, itemType: type});
  };

  /**
   * Toggle the watched status of an item
   * 
   * This function sends a request to the backend to toggle the
   * watched status of a movie or series. Collections are handled
   * in the details screen.
   * 
   * @param item - The movie, series, or collection to toggle
   * 
   * @example
   * handleToggleWatched(movieItem);
   */
  const handleToggleWatched = async (item: Movie | Series | Collection) => {
    try {
      let type: 'movie' | 'series';
      let id: string;

      if ('items' in item) {
        // Collections are handled in details screen
        return;
      } else if ('episodes' in item) {
        type = 'series';
        id = item.id;
      } else {
        type = 'movie';
        id = item.id;
      }

      const response = await apiService.toggleWatched(type, id);
      
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      // Reload the watchlist to reflect changes
      loadWatchlist();
    } catch (err) {
      Alert.alert('Error', 'Failed to update watched status');
      console.error('Error toggling watched status:', err);
    }
  };

  /**
   * Delete an item from the watchlist
   * 
   * This function shows a confirmation dialog and then deletes
   * the item from the watchlist. Collections are handled in
   * the details screen.
   * 
   * @param item - The movie, series, or collection to delete
   * 
   * @example
   * handleDelete(movieItem);
   */
  const handleDelete = (item: Movie | Series | Collection) => {
    let type: 'movie' | 'series';
    let id: string;
    let title: string;

    if ('items' in item) {
      // Collections are handled in details screen
      return;
    } else if ('episodes' in item) {
      type = 'series';
      id = item.id;
      title = item.title;
    } else {
      type = 'movie';
      id = item.id;
      title = item.title;
    }

    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${title}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deleteItem(type, id);
              
              if (response.error) {
                Alert.alert('Error', response.error);
                return;
              }

              // Reload the watchlist to reflect changes
              loadWatchlist();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete item');
              console.error('Error deleting item:', err);
            }
          },
        },
      ],
    );
  };

  /**
   * Helper function to check if an item matches runtime filter
   * 
   * @param runtime - The runtime in minutes
   * @param filter - The runtime filter to apply
   * @returns boolean indicating if item matches the filter
   */
  const matchesRuntimeFilter = (runtime: number | undefined, filter: string) => {
    if (!runtime) return true;
    switch (filter) {
      case 'short': return runtime <= 30;
      case 'standard': return runtime > 30 && runtime <= 60;
      case 'long': return runtime > 60 && runtime <= 90;
      case 'epic': return runtime > 90;
      default: return true;
    }
  };

  /**
   * Render individual watchlist items
   * 
   * This function creates a WatchlistItem component for each
   * item in the list with the appropriate event handlers.
   * 
   * @param item - The item to render
   * @returns JSX element for the item
   * 
   * @example
   * <FlatList renderItem={renderItem} />
   */
  const renderItem = ({item}: {item: Movie | Series | Collection}) => (
    <WatchlistItem
      item={item}
      onPress={() => handleItemPress(item)}
      onToggleWatched={() => handleToggleWatched(item)}
      onDelete={() => handleDelete(item)}
    />
  );

  /**
   * Prepare data for the FlatList with filtering applied
   * 
   * This function combines all watchlist data (collections, series, movies)
   * into a single array for the FlatList to render, applying the current
   * filter settings.
   * 
   * @returns Array of filtered watchlist items
   * 
   * @example
   * <FlatList data={getFlatListData()} />
   */
  const getFlatListData = () => {
    if (!watchlistData) return [];

    let data: (Movie | Series | Collection)[] = [];

    // Apply movie/series filters
    if (filters.movies) {
      data = [...data, ...watchlistData.movies];
    }
    if (filters.series) {
      data = [...data, ...watchlistData.series];
    }
    
    // Collections are always included
    data = [...data, ...watchlistData.collections];
    
    // Apply unwatched filter
    if (filters.unwatched) {
      data = data.filter(item => {
        if ('episodes' in item) { // Series
          return item.episodes.some(ep => !ep.watched);
        } else if (!('items' in item)) { // Movie
          return !item.watched;
        }
        return true; // Collections are always shown
      });
    }

    // Apply runtime filter
    if (filters.runtime !== 'all') {
      data = data.filter(item => {
        if ('episodes' in item) { // Series
          return matchesRuntimeFilter(item.average_episode_runtime, filters.runtime);
        } else if (!('items' in item) && item.runtime) { // Movie
          return matchesRuntimeFilter(item.runtime, filters.runtime);
        }
        return true; // Collections or items without runtime are always shown
      });
    }

    return data;
  };

  /**
   * Toggle a filter setting
   * 
   * @param filterKey - The filter key to toggle
   * @param value - The new value for the filter
   */
  const toggleFilter = (filterKey: keyof typeof filters, value?: any) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value !== undefined ? value : !prev[filterKey]
    }));
  };

  /**
   * Test function to verify list endpoints work
   * This is temporary for testing backend compatibility
   */
  const testListEndpoints = async () => {
    try {
      console.log('Testing list endpoints...');
      
      // Test GET /lists
      const listsResponse = await apiService.get<{lists: any[]}>('/lists');
      console.log('GET /lists response:', listsResponse);
      
      if (listsResponse.error) {
        console.error('Lists endpoint error:', listsResponse.error);
        return;
      }
      
      if (listsResponse.data && listsResponse.data.lists) {
        console.log(`Found ${listsResponse.data.lists.length} lists:`, listsResponse.data.lists);
      }
      
    } catch (error) {
      console.error('List endpoints test failed:', error);
    }
  };

  /**
   * Render filter controls
   * 
   * @returns JSX element for filter controls
   */
  const renderFilterControls = () => (
    <View style={styles.filterContainer}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filters.movies && styles.filterChipActive]}
          onPress={() => toggleFilter('movies')}
        >
          <Text style={[styles.filterChipText, filters.movies && styles.filterChipTextActive]}>
            Movies
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.series && styles.filterChipActive]}
          onPress={() => toggleFilter('series')}
        >
          <Text style={[styles.filterChipText, filters.series && styles.filterChipTextActive]}>
            Series
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.unwatched && styles.filterChipActive]}
          onPress={() => toggleFilter('unwatched')}
        >
          <Text style={[styles.filterChipText, filters.unwatched && styles.filterChipTextActive]}>
            Unwatched
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filters.runtime === 'all' && styles.filterChipActive]}
          onPress={() => toggleFilter('runtime', 'all')}
        >
          <Text style={[styles.filterChipText, filters.runtime === 'all' && styles.filterChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.runtime === 'short' && styles.filterChipActive]}
          onPress={() => toggleFilter('runtime', 'short')}
        >
          <Text style={[styles.filterChipText, filters.runtime === 'short' && styles.filterChipTextActive]}>
            ≤30m
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.runtime === 'standard' && styles.filterChipActive]}
          onPress={() => toggleFilter('runtime', 'standard')}
        >
          <Text style={[styles.filterChipText, filters.runtime === 'standard' && styles.filterChipTextActive]}>
            30-60m
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.runtime === 'long' && styles.filterChipActive]}
          onPress={() => toggleFilter('runtime', 'long')}
        >
          <Text style={[styles.filterChipText, filters.runtime === 'long' && styles.filterChipTextActive]}>
            60-90m
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterChip, filters.runtime === 'epic' && styles.filterChipActive]}
          onPress={() => toggleFilter('runtime', 'epic')}
        >
          <Text style={[styles.filterChipText, filters.runtime === 'epic' && styles.filterChipTextActive]}>
            {'>90m'}
          </Text>
        </TouchableOpacity>
        
        {/* Temporary test button - remove after testing */}
        <TouchableOpacity
          style={[styles.filterChip, {backgroundColor: '#ff6b6b'}]}
          onPress={testListEndpoints}
        >
          <Text style={[styles.filterChipText, {color: '#ffffff'}]}>
            Test Lists
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Show loading indicator while data is being fetched
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading watchlist...</Text>
      </View>
    );
  }

  // Show error message if data loading failed
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorSubtext}>
          Make sure your NAS is running and accessible at the configured IP address.
        </Text>
      </View>
    );
  }

  const data = getFlatListData();

  return (
    <View style={styles.container}>
      {renderFilterControls()}
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// Styles for the screen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  filterContainer: {
    padding: 16,
    backgroundColor: '#2a2a2a',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#3a3a3a',
    marginRight: 8,
    marginBottom: 4,
  },
  filterChipActive: {
    backgroundColor: '#00d4aa',
  },
  filterChipText: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

export default WatchlistScreen; 