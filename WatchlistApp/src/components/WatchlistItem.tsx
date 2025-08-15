import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import {Movie, Series, Collection} from '../types';

const {width} = Dimensions.get('window');

/**
 * Props interface for WatchlistItem component
 * 
 * @param item - The movie, series, or collection to display
 * @param onPress - Function called when the item is tapped
 * @param onToggleWatched - Function called when the watched checkbox is tapped
 * @param onDelete - Function called when the delete button is tapped
 */
interface WatchlistItemProps {
  item: Movie | Series | Collection;
  onPress: () => void;
  onToggleWatched: () => void;
  onDelete: () => void;
}

/**
 * WatchlistItem - Reusable component for displaying watchlist items
 * 
 * This component renders a single item (movie, series, or collection) in the
 * watchlist with a poster image, title, subtitle, watched status indicator,
 * and delete button.
 * 
 * Features:
 * - Displays poster image with fallback
 * - Shows title and contextual subtitle
 * - Visual watched status indicator (checkbox)
 * - Delete button for removing items
 * - Handles different item types (movie, series, collection)
 * 
 * @example
 * <WatchlistItem
 *   item={movieData}
 *   onPress={() => navigateToDetails(movieData)}
 *   onToggleWatched={() => toggleWatched(movieData)}
 *   onDelete={() => deleteItem(movieData)}
 * />
 */
const WatchlistItem: React.FC<WatchlistItemProps> = ({
  item,
  onPress,
  onToggleWatched,
  onDelete,
}) => {
  // Determine item type based on properties
  const isCollection = 'items' in item;
  const isSeries = 'episodes' in item;
  const isMovie = !isCollection && !isSeries;

  /**
   * Get the display title for the item
   * 
   * For collections, shows the collection title with item count.
   * For movies and series, shows the item title.
   * 
   * @returns Formatted title string
   * 
   * @example
   * "The Avengers (4 movies)" // for collection
   * "The Dark Knight" // for movie
   */
  const getItemTitle = () => {
    if (isCollection) {
      const collection = item as Collection;
      return `${collection.title} (${collection.items.length} movies)`;
    }
    return item.title;
  };

  /**
   * Get the subtitle for the item
   * 
   * Shows contextual information based on item type:
   * - Collections: Shows unwatched count
   * - Series: Shows unwatched episode count
   * - Movies: Shows year and quality info
   * 
   * @returns Formatted subtitle string
   * 
   * @example
   * "Collection • 2 unwatched" // for collection
   * "Series • 5 unwatched episodes" // for series
   * "2008 • 4K" // for movie
   */
  const getItemSubtitle = () => {
    if (isCollection) {
      const collection = item as Collection;
      const unwatchedCount = collection.items.filter(movie => !movie.watched).length;
      return `Collection • ${unwatchedCount} unwatched`;
    }
    if (isSeries) {
      const series = item as Series;
      const unwatchedCount = series.episodes.filter(episode => !episode.watched).length;
      return `Series • ${unwatchedCount} unwatched episodes`;
    }
    if (isMovie) {
      const movie = item as Movie;
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
      const quality = movie.quality ? ` • ${movie.quality}` : '';
      return `${year}${quality}`;
    }
    return '';
  };

  /**
   * Get the watched status text
   * 
   * Determines the watched status based on item type:
   * - Movies: Simple watched/not watched
   * - Series: Based on episode completion
   * - Collections: Based on movie completion
   * 
   * @returns Status string ("Watched", "Not Watched", "Partially Watched")
   * 
   * @example
   * "Watched" // all items/episodes watched
   * "Not Watched" // no items/episodes watched
   * "Partially Watched" // some items/episodes watched
   */
  const getWatchedStatus = () => {
    if (isCollection) {
      const collection = item as Collection;
      const watchedCount = collection.items.filter(movie => movie.watched).length;
      const totalCount = collection.items.length;
      
      if (watchedCount === 0) return 'Not Watched';
      if (watchedCount === totalCount) return 'Watched';
      return 'Partially Watched';
    }
    if (isSeries) {
      const series = item as Series;
      const watchedCount = series.episodes.filter(episode => episode.watched).length;
      const totalCount = series.episodes.length;
      
      if (watchedCount === 0) return 'Not Watched';
      if (watchedCount === totalCount) return 'Watched';
      return 'Partially Watched';
    }
    if (isMovie) {
      const movie = item as Movie;
      return movie.watched ? 'Watched' : 'Not Watched';
    }
    return 'Unknown';
  };

  /**
   * Get the color for the watched status indicator
   * 
   * Returns different colors based on watched status:
   * - Green: Fully watched
   * - Orange: Partially watched
   * - Red: Not watched
   * - Gray: Unknown status
   * 
   * @returns Color string for the status indicator
   * 
   * @example
   * "#4CAF50" // for watched
   * "#FF9800" // for partially watched
   * "#F44336" // for not watched
   */
  const getWatchedColor = () => {
    const status = getWatchedStatus();
    switch (status) {
      case 'Watched':
        return '#4CAF50';
      case 'Partially Watched':
        return '#FF9800';
      case 'Not Watched':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  /**
   * Get the poster URL for the item
   * 
   * For collections, uses the first movie's poster.
   * For movies and series, uses the item's poster.
   * Falls back to a default image if no poster is available.
   * 
   * @returns Poster URL string
   * 
   * @example
   * "https://example.com/poster.jpg" // actual poster
   * "/static/no-image.png" // fallback image
   */
  const getPosterUrl = () => {
    if (isCollection) {
      const collection = item as Collection;
      return collection.items[0]?.poster_url || '/static/no-image.png';
    }
    return item.poster_url || '/static/no-image.png';
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        <View style={styles.posterContainer}>
          {/* Poster image with fallback */}
          <Image
            source={{uri: getPosterUrl()}}
            style={styles.poster}
            resizeMode="cover"
          />
          {/* Watched status checkbox */}
          <TouchableOpacity
            style={styles.checkbox}
            onPress={onToggleWatched}>
            <View
              style={[
                styles.checkboxInner,
                {
                  backgroundColor: getWatchedColor(),
                },
              ]}
            />
          </TouchableOpacity>
        </View>
        
        {/* Text content (title, subtitle, status) */}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {getItemTitle()}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {getItemSubtitle()}
          </Text>
          <Text style={[styles.status, {color: getWatchedColor()}]}>
            {getWatchedStatus()}
          </Text>
        </View>
      </View>
      
      {/* Delete button */}
      <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteText}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// Component styles
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  posterContainer: {
    position: 'relative',
    marginRight: 12,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 8,
  },
  checkbox: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default WatchlistItem; 