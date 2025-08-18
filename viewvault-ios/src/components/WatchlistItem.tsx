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

interface WatchlistItemProps {
  item: Movie | Series | Collection;
  onPress: () => void;
  onToggleWatched: () => void;
}

const WatchlistItem: React.FC<WatchlistItemProps> = ({
  item,
  onPress,
  onToggleWatched,
}) => {
  const isCollection = 'items' in item;
  const isSeries = 'episodes' in item;
  const isMovie = !isCollection && !isSeries;

  const getItemTitle = () => {
    if (isCollection) {
      const collection = item as Collection;
      return `${collection.title} (${collection.items.length} movies)`;
    }
    return item.title;
  };

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

  const getWatchedColor = () => {
    const status = getWatchedStatus();
    switch (status) {
      case 'Watched':
        return '#00d4aa'; // Bright mint/aqua for watched
      case 'Partially Watched':
        return '#FF9800'; // Orange for partially watched
      case 'Not Watched':
        return '#7C3AED'; // Medium purple from gradient theme
      default:
        return '#757575';
    }
  };

  const getPosterUrl = () => {
    const convertToAbsoluteUrl = (url: string) => {
      if (!url || url === '/static/no-image.png' || url === '' || url === null || url === undefined || url.includes('no-image')) {
        return 'https://wlapp.umpyours.com/static/no-image.png';
      }
      
      // If it's already an absolute URL (starts with http/https), return as is
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      // If it's a relative URL, prepend the base URL
      if (url.startsWith('/')) {
        return `https://wlapp.umpyours.com${url}`;
      }
      
      // If it's a relative URL without leading slash, add it
      return `https://wlapp.umpyours.com/${url}`;
    };

    if (isCollection) {
      const collection = item as Collection;
      console.log('Processing collection:', collection.title, 'with', collection.items.length, 'items');
      
      // Debug: Log all items in the collection to see their poster URLs
      collection.items.forEach((item, index) => {
        console.log(`  Item ${index}: ${item.title} - poster_url: "${item.poster_url}"`);
      });
      
      // Try to find the best poster from the collection items
      // Look for an item with a valid poster_url (not empty, null, or placeholder)
      const itemWithPoster = collection.items.find(item => {
        const posterUrl = item.poster_url;
        const isValid = posterUrl && 
               posterUrl !== '/static/no-image.png' && 
               posterUrl !== '' && 
               posterUrl !== null && 
               posterUrl !== undefined &&
               !posterUrl.includes('no-image');
        console.log(`  Checking poster for ${item.title}: "${posterUrl}" - valid: ${isValid}`);
        return isValid;
      });
      
      if (itemWithPoster) {
        const absoluteUrl = convertToAbsoluteUrl(itemWithPoster.poster_url);
        console.log('Collection poster found:', absoluteUrl, 'for collection:', collection.title);
        return absoluteUrl;
      }
      
      // If no item has a valid poster, try the first item anyway
      if (collection.items.length > 0) {
        const firstItemPoster = collection.items[0].poster_url;
        console.log('Collection using first item poster:', firstItemPoster, 'for collection:', collection.title);
        
        // Check if the first item's poster is valid
        if (firstItemPoster && 
            firstItemPoster !== '/static/no-image.png' && 
            firstItemPoster !== '' && 
            firstItemPoster !== null && 
            firstItemPoster !== undefined &&
            !firstItemPoster.includes('no-image')) {
          const absoluteUrl = convertToAbsoluteUrl(firstItemPoster);
          return absoluteUrl;
        }
      }
      
      console.log('No valid poster found for collection:', collection.title, 'using default');
      return 'https://wlapp.umpyours.com/static/no-image.png';
    }
    if (isSeries) {
      const series = item as Series;
      console.log('Series poster URL:', series.poster_url, 'for series:', series.title);
      return convertToAbsoluteUrl(series.poster_url);
    }
    return convertToAbsoluteUrl(item.poster_url);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.content}>
        <View style={styles.posterContainer}>
          <Image
            source={{uri: getPosterUrl()}}
            style={styles.poster}
            resizeMode="cover"
            onError={(error) => {
              console.log('Image loading error for:', getPosterUrl(), 'Error:', error.nativeEvent);
            }}
            onLoad={() => {
              console.log('Image loaded successfully for:', getPosterUrl());
            }}
          />
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
        
        {/* Delete button - only show for movies and series, not collections */}
        {/* Removed delete button as per edit hint */}

      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderTopColor: '#404040',
    borderLeftColor: '#404040',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    padding: 8,
    margin: -8,
    shadowColor: '#fff',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  posterContainer: {
    position: 'relative',
    marginRight: 12,
  },
  poster: {
    width: 50,
    height: 75,
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

});

export default WatchlistItem; 