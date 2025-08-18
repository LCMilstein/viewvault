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
  const [collectionNotes, setCollectionNotes] = useState('');
  const [isEditingCollectionNotes, setIsEditingCollectionNotes] = useState(false);

  useEffect(() => {
    loadItemDetails();
  }, [itemId, itemType]);

  const loadItemDetails = async () => {
    try {
      setError(null);
      console.log(`🔍 DETAILS: Loading details for ${itemType} with ID: ${itemId}`);
      
      // First try the personal watchlist
      const personalResponse = await apiService.getWatchlist();
      let foundItem: Movie | Series | Collection | null = null;
      
      if (personalResponse.data) {
        console.log(`🔍 DETAILS: Personal list has ${personalResponse.data.collections?.length || 0} collections, ${personalResponse.data.movies?.length || 0} movies, ${personalResponse.data.series?.length || 0} series`);
        foundItem = searchInData(personalResponse.data, itemType, itemId);
        if (foundItem) {
          console.log(`🔍 DETAILS: Found ${itemType} "${foundItem.title}" in personal list`);
        }
      }
      
      // If not found in personal list, search other lists
      if (!foundItem) {
        console.log(`🔍 DETAILS: Not found in personal list, searching other lists...`);
        const listsResponse = await apiService.getLists();
        
        if (listsResponse.data?.lists) {
          for (const list of listsResponse.data.lists) {
            if (list.type !== 'personal' && !foundItem) {
              try {
                console.log(`🔍 DETAILS: Searching in list "${list.name}" (${list.type})`);
                const listDataResponse = await apiService.getListItems(list.id.toString());
                if (listDataResponse.data) {
                  console.log(`🔍 DETAILS: List "${list.name}" has ${listDataResponse.data.collections?.length || 0} collections, ${listDataResponse.data.movies?.length || 0} movies, ${listDataResponse.data.series?.length || 0} series`);
                  foundItem = searchInData(listDataResponse.data, itemType, itemId);
                  if (foundItem) {
                    console.log(`🔍 DETAILS: Found ${itemType} "${foundItem.title}" in list "${list.name}"`);
                    break;
                  }
                }
              } catch (listError) {
                console.warn(`🔍 DETAILS: Failed to load data for list ${list.name}:`, listError);
              }
            }
          }
        }
      }
      
      if (foundItem) {
        setItemData(foundItem);
        // Only set notes for movies and series, not collections
        if ('notes' in foundItem) {
          setNotes(foundItem.notes || '');
        }
        console.log(`🔍 DETAILS: Successfully loaded ${itemType} details for "${foundItem.title}"`);
      } else {
        console.error(`🔍 DETAILS: Item not found - ${itemType} with ID: ${itemId}`);
        setError('Item not found');
      }
    } catch (err) {
      setError('Failed to load item details');
      console.error('Error loading item details:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to search for an item in a data source
  const searchInData = (data: any, type: string, id: string): Movie | Series | Collection | null => {
    console.log(`🔍 DETAILS: Searching for ${type} with ID ${id} in data source`);
    
    if (type === 'collection' && data.collections) {
      console.log(`🔍 DETAILS: Searching ${data.collections.length} collections for ID ${id}`);
      for (const collection of data.collections) {
        console.log(`🔍 DETAILS: Checking collection "${collection.title}" with ID ${collection.id} (type: ${typeof collection.id})`);
        // Compare both as strings and as numbers to handle type mismatches
        if (collection.id.toString() === id || collection.id.toString() === id.toString() || collection.id === parseInt(id)) {
          console.log(`🔍 DETAILS: ✅ MATCH FOUND! Collection "${collection.title}" matches ID ${id}`);
          return collection;
        }
      }
    } else if (type === 'series' && data.series) {
      console.log(`🔍 DETAILS: Searching ${data.series.length} series for ID ${id}`);
      return data.series.find((s: Series) => s.id === id) || null;
    } else if (type === 'movie') {
      // First try to find in standalone movies
      if (data.movies) {
        console.log(`🔍 DETAILS: Searching ${data.movies.length} standalone movies for ID ${id}`);
        const foundMovie = data.movies.find((m: Movie) => m.id === id);
        if (foundMovie) return foundMovie;
      }
      
      // If not found in standalone movies, search in collections
      if (data.collections) {
        console.log(`🔍 DETAILS: Searching in collections for movie with ID ${id}`);
        for (const collection of data.collections) {
          const movieInCollection = collection.items.find((m: Movie) => m.id === id);
          if (movieInCollection) {
            console.log(`🔍 DETAILS: Found movie in collection "${collection.title}"`);
            return movieInCollection;
          }
        }
      }
    }
    
    return null;
  };

  // Helper function to get the best poster URL for any item type
  const getPosterUrl = () => {
    if (!itemData) return 'https://wlapp.umpyours.com/static/no-image.png';
    
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

    // Handle collections - find the best poster from collection items
    if ('items' in itemData) {
      const collection = itemData as Collection;
      console.log('Processing collection poster for:', collection.title, 'with', collection.items.length, 'items');
      
      // Try to find the best poster from the collection items
      const itemWithPoster = collection.items.find(item => {
        const posterUrl = item.poster_url;
        const isValid = posterUrl && 
               posterUrl !== '/static/no-image.png' && 
               posterUrl !== '' && 
               posterUrl !== null && 
               posterUrl !== undefined &&
               !posterUrl.includes('no-image');
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
    
    // Handle series and movies
    return convertToAbsoluteUrl(itemData.poster_url);
  };

  // Helper function to get poster URL for individual movies in collections
  const getMoviePosterUrl = (movie: Movie) => {
    const convertToAbsoluteUrl = (url: string) => {
      if (!url || url === '/static/no-image.png' || url === '' || url === null || url === undefined || url.includes('no-image')) {
        return 'https://wlapp.umpyours.com/static/no-image.png';
      }
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      if (url.startsWith('/')) {
        return `https://wlapp.umpyours.com${url}`;
      }
      
      return `https://wlapp.umpyours.com/${url}`;
    };

    return convertToAbsoluteUrl(movie.poster_url);
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
      } else if ('episodes' in itemData) {
        type = 'series';
        id = itemData.id;
      } else {
        type = 'movie';
        id = itemData.id;
      }

      if (!type || !id) {
        Alert.alert('Error', 'Cannot toggle watched status for this item');
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
        episode.season_number,
        episode.episode_number,
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
        return '#00d4aa'; // Bright mint/aqua for watched
      case 'Partially Watched':
        return '#FF9800'; // Orange for partially watched
      case 'Not Watched':
        return '#7C3AED'; // Medium purple from gradient theme
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
          source={{uri: getMoviePosterUrl(movie)}}
          style={styles.moviePoster}
          resizeMode="cover"
          onError={(error) => {
            console.log('Movie image loading error for:', movie.title, 'Error:', error.nativeEvent);
          }}
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
                backgroundColor: movie.watched ? '#00d4aa' : '#7C3AED',
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
          S{episode.season_number}E{episode.episode_number}
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
                backgroundColor: episode.watched ? '#00d4aa' : '#7C3AED',
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

        {/* Collection-specific information */}
        {('items' in itemData) && (
          <View style={styles.collectionInfo}>
            <Text style={styles.collectionStats}>
              {(itemData as Collection).items.length} movies in collection
            </Text>
            <Text style={styles.collectionProgress}>
              {(itemData as Collection).items.filter(m => m.watched).length} watched
            </Text>
            {(itemData as Collection).overview && (
              <View style={styles.overviewSection}>
                <Text style={styles.overviewTitle}>Collection Overview</Text>
                <Text style={styles.overviewText}>
                  {(itemData as Collection).overview}
                </Text>
              </View>
            )}

            {/* Collection Notes Section */}
            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Collection Notes</Text>
              {isEditingCollectionNotes ? (
                <>
                  <TextInput
                    style={styles.notesInput}
                    value={collectionNotes}
                    onChangeText={setCollectionNotes}
                    placeholder="Add notes about this collection..."
                    placeholderTextColor="#999"
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={styles.notesButtons}>
                    <TouchableOpacity style={styles.saveButton} onPress={() => setIsEditingCollectionNotes(false)}>
                      <Text style={styles.saveButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditingCollectionNotes(false)}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {collectionNotes ? (
                    <Text style={styles.notesText}>{collectionNotes}</Text>
                  ) : (
                    <Text style={[styles.notesText, {fontStyle: 'italic'}]}>No notes added yet</Text>
                  )}
                  <TouchableOpacity style={styles.editButton} onPress={() => setIsEditingCollectionNotes(true)}>
                    <Text style={styles.editButtonText}>Edit Notes</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Remove Collection Button */}
            <View style={styles.removeSection}>
              <TouchableOpacity 
                style={styles.removeButton} 
                onPress={() => {
                  Alert.alert(
                    'Remove Collection',
                    `Are you sure you want to remove "${(itemData as Collection).title}" from your watchlist?`,
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            // For collections, we need to delete each movie individually first
                            const collection = itemData as Collection;
                            let hasErrors = false;
                            
                            // Delete all movies in the collection
                            for (const movie of collection.items) {
                              try {
                                const response = await apiService.deleteItem('movie', movie.id);
                                if (response.error) {
                                  console.error(`Failed to delete movie ${movie.title}:`, response.error);
                                  hasErrors = true;
                                }
                              } catch (err) {
                                console.error(`Error deleting movie ${movie.title}:`, err);
                                hasErrors = true;
                              }
                            }
                            
                            if (hasErrors) {
                              Alert.alert('Warning', 'Some movies could not be removed. The collection may still exist.');
                            } else {
                              Alert.alert('Success', `Removed "${collection.title}" collection and all movies`, [
                                {text: 'OK', onPress: () => navigation.goBack()}
                              ]);
                            }
                          } catch (err) {
                            Alert.alert('Error', 'Failed to remove collection');
                            console.error('Error removing collection:', err);
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                <Text style={styles.removeButtonText}>🗑️ Remove Collection</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Series-specific information */}
        {('episodes' in itemData) && (
          <View style={styles.seriesInfo}>
            <Text style={styles.seriesStats}>
              {(itemData as Series).episodes.length} episodes
            </Text>
            <Text style={styles.seriesProgress}>
              {(itemData as Series).episodes.filter(e => e.watched).length} watched
            </Text>
            {(itemData as Series).average_episode_runtime && (
              <Text style={styles.infoText}>
                Average Episode Runtime: {(itemData as Series).average_episode_runtime} minutes
              </Text>
            )}
          </View>
        )}

        {/* Movie-specific information */}
        {!('items' in itemData) && !('episodes' in itemData) && (
          <View style={styles.movieInfo}>
            {itemData.release_date && (
              <Text style={styles.infoText}>
                Release Date: {itemData.release_date}
              </Text>
            )}
            {itemData.runtime && (
              <Text style={styles.infoText}>
                Runtime: {itemData.runtime} minutes
              </Text>
            )}
            {itemData.quality && (
              <Text style={styles.infoText}>
                Quality: {itemData.quality}
              </Text>
            )}
            {(itemData as Movie).overview && (
              <View style={styles.overviewSection}>
                <Text style={styles.overviewTitle}>Overview</Text>
                <Text style={styles.overviewText}>
                  {(itemData as Movie).overview}
                </Text>
              </View>
            )}
          </View>
        )}

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

        {/* Delete Movie/Series Button */}
        {!('items' in itemData) && (
          <View style={styles.removeSection}>
            <TouchableOpacity 
              style={styles.removeButton} 
              onPress={() => {
                const itemTitle = itemData.title;
                const itemType = 'episodes' in itemData ? 'series' : 'movie';
                Alert.alert(
                  'Remove Item',
                  `Are you sure you want to remove "${itemTitle}" from your watchlist?`,
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const response = await apiService.deleteItem(itemType, itemData.id);
                          
                          if (response.error) {
                            Alert.alert('Error', response.error);
                            return;
                          }

                          Alert.alert('Success', `Removed "${itemTitle}" from watchlist`, [
                            {text: 'OK', onPress: () => navigation.goBack()}
                          ]);
                        } catch (err) {
                          Alert.alert('Error', 'Failed to remove item');
                          console.error('Error removing item:', err);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={styles.removeButtonText}>🗑️ Remove {('episodes' in itemData) ? 'Series' : 'Movie'}</Text>
            </TouchableOpacity>
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
    color: '#7C3AED',
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
    backgroundColor: '#00d4aa',
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
    color: '#999999',
    fontWeight: '600',
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
  movieInfo: {
    marginBottom: 24,
  },
  collectionInfo: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    marginBottom: 24,
  },
  collectionStats: {
    color: '#00d4aa',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  collectionProgress: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 12,
  },
  seriesInfo: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    marginBottom: 24,
  },
  seriesStats: {
    color: '#00d4aa',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  seriesProgress: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 12,
  },
  overviewSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#00d4aa',
  },
  overviewTitle: {
    color: '#00d4aa',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  overviewText: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
  },
  infoText: {
    fontSize: 16,
    color: '#cccccc',
    marginBottom: 8,
  },
  removeSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  removeButton: {
    backgroundColor: '#d32f2f',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DetailsScreen; 