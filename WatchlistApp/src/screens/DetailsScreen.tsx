import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import apiService from '../services/api';
import {Movie, Series, Collection, Episode} from '../types';
import {RootStackParamList} from '../../App';

type DetailsScreenRouteProp = RouteProp<RootStackParamList, 'Details'>;
type DetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Details'>;

const DetailsScreen: React.FC = () => {
  const route = useRoute<DetailsScreenRouteProp>();
  const navigation = useNavigation<DetailsScreenNavigationProp>();
  const {itemId, itemType} = route.params;

  const [itemData, setItemData] = useState<Movie | Series | Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  useEffect(() => {
    loadItemDetails();
  }, [itemId, itemType]);

  const loadItemDetails = async () => {
    try {
      setError(null);
      const response = await apiService.getWatchlist();
      
      if (response.error) {
        setError(response.error);
        return;
      }
      
      if (response.data) {
        let foundItem: Movie | Series | Collection | null = null;
        
        if (itemType === 'collection') {
          foundItem = response.data.collections.find(c => c.id === itemId) || null;
        } else if (itemType === 'series') {
          foundItem = response.data.series.find(s => s.id === itemId) || null;
        } else if (itemType === 'movie') {
          foundItem = response.data.movies.find(m => m.id === itemId) || null;
        }
        
        if (foundItem) {
          setItemData(foundItem);
          // Only set notes if the item has a notes property
          if ('notes' in foundItem && foundItem.notes !== undefined) {
            setNotes(foundItem.notes);
          } else {
            setNotes('');
          }
        } else {
          setError('Item not found');
        }
      }
    } catch (err) {
      setError('Failed to load item details');
      console.error('Error loading item details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWatched = async () => {
    if (!itemData) return;

    try {
      let type: 'movie' | 'series' | undefined;
      let id: string | undefined;

      if ('items' in itemData) {
        // For collections, show confirmation dialog
        const collection = itemData as Collection;
        const watchedCount = collection.items.filter(movie => movie.watched).length;
        const totalCount = collection.items.length;
        
        if (watchedCount > 0 && watchedCount < totalCount) {
          const action = watchedCount === totalCount ? 'unwatch' : 'watch';
          const message = `Mark all ${totalCount} items in "${collection.title}" as ${action === 'watch' ? 'watched' : 'unwatched'}?`;
          
          Alert.alert('Collection Action', message, [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Confirm',
              onPress: async () => {
                // Handle collection-wide toggle
                // This would need to be implemented in the backend
                Alert.alert('Info', 'Collection-wide toggle not yet implemented');
              },
            },
          ]);
          return;
        }
        // Collections don't support toggle watched, so return early
        return;
      } else if ('episodes' in itemData) {
        type = 'series';
        id = itemData.id;
      } else {
        type = 'movie';
        id = itemData.id;
      }

      // Ensure both type and id are defined before proceeding
      if (!type || !id) {
        Alert.alert('Error', 'Unable to determine item type');
        return;
      }

      const response = await apiService.toggleWatched(type, id);
      
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      // Reload the item details
      loadItemDetails();
    } catch (err) {
      Alert.alert('Error', 'Failed to update watched status');
      console.error('Error toggling watched status:', err);
    }
  };

  const handleToggleEpisodeWatched = async (episode: Episode) => {
    try {
      const response = await apiService.toggleEpisodeWatched(
        episode.series_id,
        episode.season,
        episode.episode,
      );
      
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      // Reload the item details
      loadItemDetails();
    } catch (err) {
      Alert.alert('Error', 'Failed to update episode watched status');
      console.error('Error toggling episode watched status:', err);
    }
  };

  const handleSaveNotes = async () => {
    if (!itemData) return;

    try {
      let type: 'movie' | 'series' | 'episode';
      let id: string;

      if ('items' in itemData) {
        // Collections don't have notes
        return;
      } else if ('episodes' in itemData) {
        type = 'series';
        id = itemData.id;
      } else {
        type = 'movie';
        id = itemData.id;
      }

      const response = await apiService.saveNotes(type, id, notes);
      
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      setIsEditingNotes(false);
      Alert.alert('Success', 'Notes saved successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to save notes');
      console.error('Error saving notes:', err);
    }
  };

  const getWatchedStatus = () => {
    if (!itemData) return 'Unknown';

    if ('items' in itemData) {
      const collection = itemData as Collection;
      const watchedCount = collection.items.filter(movie => movie.watched).length;
      const totalCount = collection.items.length;
      
      if (watchedCount === 0) return 'Not Watched';
      if (watchedCount === totalCount) return 'Watched';
      return 'Partially Watched';
    }
    
    if ('episodes' in itemData) {
      const series = itemData as Series;
      const watchedCount = series.episodes.filter(episode => episode.watched).length;
      const totalCount = series.episodes.length;
      
      if (watchedCount === 0) return 'Not Watched';
      if (watchedCount === totalCount) return 'Watched';
      return 'Partially Watched';
    }
    
    if ('watched' in itemData) {
      const movie = itemData as Movie;
      return movie.watched ? 'Watched' : 'Not Watched';
    }
    
    return 'Unknown';
  };

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

  const renderMovieItem = (movie: Movie) => (
    <TouchableOpacity
      key={movie.id}
      style={[styles.movieItem, movie.watched && styles.watchedItem]}
      onPress={() => {
        navigation.navigate('Details', {
          itemId: movie.id,
          itemType: 'movie',
        });
      }}>
      <View style={styles.moviePosterContainer}>
        <Image
          source={{uri: movie.poster_url || '/static/no-image.png'}}
          style={styles.moviePoster}
          resizeMode="cover"
        />
        <TouchableOpacity
          style={styles.movieCheckbox}
          onPress={() => {
            // Handle movie toggle within collection
            Alert.alert('Info', 'Movie toggle within collection not yet implemented');
          }}>
          <View
            style={[
              styles.checkboxInner,
              {
                backgroundColor: movie.watched ? '#4CAF50' : '#F44336',
              },
            ]}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.movieTextContainer}>
        <Text style={[styles.movieTitle, movie.watched && styles.watchedText]}>
          {movie.title}
        </Text>
        <Text style={[styles.movieYear, movie.watched && styles.watchedText]}>
          {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEpisodeItem = (episode: Episode) => (
    <TouchableOpacity
      key={episode.id}
      style={[styles.episodeItem, episode.watched && styles.watchedItem]}
      onPress={() => handleToggleEpisodeWatched(episode)}>
      <View style={styles.episodeTextContainer}>
        <Text style={[styles.episodeCode, episode.watched && styles.watchedText]}>
          {episode.code}
        </Text>
        <Text style={[styles.episodeTitle, episode.watched && styles.watchedText]}>
          {episode.title}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.episodeCheckbox}
        onPress={() => handleToggleEpisodeWatched(episode)}>
        <View
          style={[
            styles.checkboxInner,
            {
              backgroundColor: episode.watched ? '#4CAF50' : '#F44336',
            },
          ]}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (error || !itemData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Item not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{uri: ('poster_url' in itemData && itemData.poster_url) || '/static/no-image.png'}}
          style={styles.poster}
          resizeMode="cover"
        />
        <View style={styles.posterOverlay}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={handleToggleWatched}>
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
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{itemData.title}</Text>
        <Text style={[styles.status, {color: getWatchedColor()}]}>
          {getWatchedStatus()}
        </Text>

        {!('items' in itemData) && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            {isEditingNotes ? (
              <View>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="Add your notes here..."
                  placeholderTextColor="#666"
                />
                <View style={styles.notesButtons}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveNotes}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setIsEditingNotes(false);
                      setNotes(itemData.notes || '');
                    }}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.notesText}>
                  {notes || 'No notes added yet.'}
                </Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditingNotes(true)}>
                  <Text style={styles.editButtonText}>
                    {notes ? 'Edit Notes' : 'Add Notes'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {('items' in itemData) && (
          <View style={styles.collectionSection}>
            <Text style={styles.sectionTitle}>Movies in Collection</Text>
            {(itemData as Collection).items.map(renderMovieItem)}
          </View>
        )}

        {('episodes' in itemData) && (
          <View style={styles.episodesSection}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            {(itemData as Series).episodes.map(renderEpisodeItem)}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

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
    paddingHorizontal: 32,
  },
  errorText: {
    color: '#f44336',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    position: 'relative',
    alignItems: 'center',
    paddingVertical: 20,
  },
  poster: {
    width: 200,
    height: 300,
    borderRadius: 12,
  },
  posterOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 24,
  },
  notesSection: {
    marginBottom: 24,
  },
  notesLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  notesInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  notesButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#666',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  notesText: {
    color: '#cccccc',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  editButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  editButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  collectionSection: {
    marginBottom: 24,
  },
  movieItem: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  watchedItem: {
    opacity: 0.6,
  },
  moviePosterContainer: {
    position: 'relative',
    marginRight: 12,
  },
  moviePoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
  },
  movieCheckbox: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieTextContainer: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  movieYear: {
    fontSize: 14,
    color: '#cccccc',
  },
  watchedText: {
    textDecorationLine: 'line-through',
  },
  episodesSection: {
    marginBottom: 24,
  },
  episodeItem: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  episodeTextContainer: {
    flex: 1,
  },
  episodeCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 16,
    color: '#cccccc',
  },
  episodeCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DetailsScreen; 