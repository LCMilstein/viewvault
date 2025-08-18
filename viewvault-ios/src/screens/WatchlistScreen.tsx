import React, {useState, useEffect, useCallback} from 'react';
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
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import WatchlistItem from '../components/WatchlistItem';
import Omnibox from '../components/Omnibox';
import FilterChips, {FilterOption} from '../components/FilterChips';
import SortChips, {SortOption} from '../components/SortChips';
import ListSelector from '../components/ListSelector';
import HamburgerMenu from '../components/HamburgerMenu';
import LibrarySelectionModal from '../components/LibrarySelectionModal';
import SearchResultsModal from '../components/SearchResultsModal';
import Toast from '../components/Toast';
import NewListModal from '../components/NewListModal';
import ListMenuModal from '../components/ListMenuModal';
import ShareListModal from '../components/ShareListModal';
import ImportToListsModal from '../components/ImportToListsModal';
import JellyfinImportModal from '../components/JellyfinImportModal';
import NotificationsModal from '../components/NotificationsModal';
import apiService from '../services/api';
import {WatchlistData, Movie, Series, Collection, List, ListsResponse} from '../types';
import {RootStackParamList} from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

type WatchlistScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Watchlist'>;

const WatchlistScreen: React.FC = () => {
  const navigation = useNavigation<WatchlistScreenNavigationProp>();
  const [watchlistData, setWatchlistData] = useState<WatchlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [sortActive, setSortActive] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const [listActive, setListActive] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  
  // Jellyfin import state
  const [jellyfinModalVisible, setJellyfinModalVisible] = useState(false);
  const [jellyfinLibraries, setJellyfinLibraries] = useState<any[]>([]);
  const [importingFromJellyfin, setImportingFromJellyfin] = useState(false);
  
  // Search results modal state
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingResults, setIsSearchingResults] = useState(false);
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  
  // Offline caching state
  const [isOffline, setIsOffline] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // Notifications state
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationDetails, setNotificationDetails] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasEverHadNotifications, setHasEverHadNotifications] = useState(false);
  
  // Filter and sort options - match web app logic: true = show, false = hide
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([
    {id: 'unwatched', label: 'Unwatched Only', active: true},
    {id: 'movies', label: 'Movies', active: true},
    {id: 'series', label: 'TV Shows', active: true},
    {id: 'runtime_under_30', label: '<30 min', active: true},
    {id: 'runtime_30_60', label: '30-60 min', active: true},
    {id: 'runtime_60_90', label: '60-90 min', active: true},
    {id: 'runtime_over_90', label: '>90 min', active: true},
  ]);
  
  const [sortOptions, setSortOptions] = useState<SortOption[]>([
    {id: 'title', label: 'Title', active: true, direction: 'asc'},
    {id: 'date', label: 'Date Added', active: false, direction: 'desc'},
    {id: 'type', label: 'Type', active: false, direction: 'asc'},
    {id: 'release_date', label: 'Release Date', active: false, direction: 'asc'},
  ]);

  // List Management State - now loaded from backend
  const [lists, setLists] = useState<List[]>([
    {
      id: 'personal',
      name: 'My Watchlist',
      type: 'personal',
      isActive: true,
      itemCount: 0,
      createdAt: new Date(),
      description: 'Your personal watchlist',
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ]);
  const [activeListId, setActiveListId] = useState<string>('personal');
  const [newListModalVisible, setNewListModalVisible] = useState(false);
  const [listMenuModalVisible, setListMenuModalVisible] = useState(false);
  const [shareListModalVisible, setShareListModalVisible] = useState(false);
  const [shareListTarget, setShareListTarget] = useState<List | null>(null);
  const [importToListsModalVisible, setImportToListsModalVisible] = useState(false);
  const [importTargetItem, setImportTargetItem] = useState<any>(null);
  // List-specific data storage
  const [listData, setListData] = useState<{[key: string]: WatchlistData}>({});
  const [selectedListIds, setSelectedListIds] = useState<string[]>(['personal']);
  // Enhanced watched status tracking per list
  const [listWatchedStatus, setListWatchedStatus] = useState<{
    [itemId: string]: {
      [listId: string]: {
        watched: boolean;
        watchedBy: string; // 'you', 'family', 'both'
        watchedAt?: Date;
      }
    }
  }>({});

  // Helper function to show toast notifications
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  // Notification functions
  const loadNotifications = async () => {
    try {
      const countResponse = await apiService.getNewReleasesCount();
      if (countResponse.data) {
        setNotificationCount(countResponse.data.count);
        
        // Track if we've ever had notifications
        if (countResponse.data.count > 0) {
          setHasEverHadNotifications(true);
          // Persist this state
          AsyncStorage.setItem('hasEverHadNotifications', 'true');
        }
        
        // If there are notifications, load details
        if (countResponse.data.count > 0) {
          const detailsResponse = await apiService.getNewReleasesDetails();
          if (detailsResponse.data) {
            setNotificationDetails(detailsResponse.data);
            
            // Show iOS notification if app is in background/foreground
            if (countResponse.data.count > 0) {
              PushNotificationIOS.addNotificationRequest({
                id: 'new_releases',
                title: '🆕 New Content Available!',
                body: `${countResponse.data.count} new release${countResponse.data.count !== 1 ? 's' : ''} found in your watchlist!`,
                sound: 'default',
                badge: countResponse.data.count,
                userInfo: {
                  type: 'new_releases',
                  count: countResponse.data.count,
                },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const markNotificationsSeen = async () => {
    try {
      await apiService.markNotificationsSeen();
      setNotificationCount(0);
      setNotificationDetails([]);
      setShowNotifications(false);
      
      // Clear iOS badge
      PushNotificationIOS.setApplicationIconBadgeNumber(0);
    } catch (error) {
      console.error('Failed to mark notifications as seen:', error);
    }
  };

  const handleNotificationPress = () => {
    // Allow opening notifications if there are new ones OR if there have ever been notifications
    if (notificationCount > 0 || hasEverHadNotifications) {
      setShowNotifications(true);
    }
  };

  // Function to determine notification bell state and icon
  const getNotificationBellState = () => {
    if (notificationCount > 0) {
      return { icon: '🔔', style: 'active', visible: true }; // Gold bell with new notifications
    } else if (hasEverHadNotifications) {
      return { icon: '🔔', style: 'outline', visible: true }; // Outline bell with seen notifications
    } else {
      return { icon: '🔔', style: 'hidden', visible: false }; // Hidden when no notifications ever
    }
  };

  // Offline caching functions
  const saveToCache = async (data: WatchlistData) => {
    try {
      await AsyncStorage.setItem('watchlist_cache', JSON.stringify(data));
      await AsyncStorage.setItem('watchlist_cache_timestamp', new Date().toISOString());
      setLastSyncTime(new Date());
      console.log('Watchlist data cached successfully');
    } catch (error) {
      console.log('Error caching data:', error);
    }
  };

  const loadFromCache = async (): Promise<WatchlistData | null> => {
    try {
      const cachedData = await AsyncStorage.getItem('watchlist_cache');
      const timestamp = await AsyncStorage.getItem('watchlist_cache_timestamp');
      
      if (cachedData && timestamp) {
        const data = JSON.parse(cachedData);
        const cacheTime = new Date(timestamp);
        const now = new Date();
        const cacheAge = now.getTime() - cacheTime.getTime();
        
        // Cache is valid for 24 hours
        if (cacheAge < 24 * 60 * 60 * 1000) {
          setLastSyncTime(cacheTime);
          console.log('Loading from cache, last sync:', cacheTime);
          console.log('🔍 CACHE DEBUG: Cached data structure:', {
            hasMovies: !!data.movies,
            hasSeries: !!data.series,
            hasCollections: !!data.collections,
            moviesCount: data.movies?.length || 0,
            seriesCount: data.series?.length || 0,
            collectionsCount: data.collections?.length || 0,
            dataKeys: Object.keys(data)
          });
          return data;
        } else {
          console.log('Cache expired, clearing old data');
          await AsyncStorage.removeItem('watchlist_cache');
          await AsyncStorage.removeItem('watchlist_cache_timestamp');
        }
      }
      return null;
    } catch (error) {
      console.log('Error loading from cache:', error);
      return null;
    }
  };

  const checkConnectivity = async (): Promise<boolean> => {
    try {
      // Simple connectivity check - try to fetch a small resource
      const response = await fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD'
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  // Initialize iOS push notifications
  useEffect(() => {
    try {
      // Request notification permissions
      PushNotificationIOS.requestPermissions({
        alert: true,
        badge: true,
        sound: true,
      }).then((permissions) => {
        console.log('Notification permissions:', permissions);
      });
      
      console.log('iOS push notifications initialized successfully');
    } catch (error) {
      console.log('Push notification setup error:', error);
    }
  }, []);

  // Load lists from backend on component mount
  useEffect(() => {
    // Check if user is authenticated via apiService
    if (apiService.isAuthenticated()) {
      loadUserLists();
      loadNotifications(); // Load notifications on app start
      loadNotificationHistory(); // Load persisted notification history
    }
  }, []);

  // Load persisted notification history
  const loadNotificationHistory = async () => {
    try {
      const hasNotifications = await AsyncStorage.getItem('hasEverHadNotifications');
      if (hasNotifications === 'true') {
        setHasEverHadNotifications(true);
      }
    } catch (error) {
      console.log('Error loading notification history:', error);
    }
  };

  // List management functions
  const handleListSelect = (listId: string) => {
    console.log(`🔍 LIST SELECT: Selecting list ${listId}`);
    
    // Toggle selection for multi-select
    setSelectedListIds(prev => {
      const newSelection = prev.includes(listId) 
        ? (prev.length > 1 ? prev.filter(id => id !== listId) : prev)
        : [...prev, listId];
      
      console.log(`🔍 LIST SELECT: Selection changed from [${prev.join(', ')}] to [${newSelection.join(', ')}]`);
      return newSelection;
    });
    
    // Set as active list for single-list operations
    setActiveListId(listId);
    
    // Load list-specific data
    loadListData(listId);
    
    const listName = lists.find(l => l.id === listId)?.name || 'list';
    showToast(`Switched to ${listName}`, 'info');
  };

  // Load list data from backend using new API
  const loadListData = async (listId: string) => {
    console.log(`🔍 LOAD LIST: Loading data for list ${listId}`);
    
    try {
      if (listId === 'personal') {
        // For personal list, use the main watchlist endpoint
        const response = await apiService.getWatchlist();
        if (response.data) {
          console.log(`🔍 LOAD LIST: Received personal watchlist data:`, response.data);
          setListData(prev => ({
            ...prev,
            [listId]: response.data as WatchlistData,
          }));
        }
      } else {
        // For custom/shared lists, use the list items endpoint
        const response = await apiService.getListItems(listId);
        if (response.data) {
          console.log(`🔍 LOAD LIST: Received data for list ${listId}:`, response.data);
          setListData(prev => ({
            ...prev,
            [listId]: response.data as WatchlistData,
          }));
        } else {
          console.log(`🔍 LOAD LIST: No data received for list ${listId}`);
        }
      }
    } catch (error) {
      console.error(`Failed to load list ${listId}:`, error);
      // Initialize empty list data
      setListData(prev => ({
        ...prev,
        [listId]: { movies: [], series: [], collections: [] },
      }));
    }
  };

  // Handle toggling watched status
  const handleToggleWatched = async (item: Movie | Series | Collection) => {
    try {
      console.log('🔄 handleToggleWatched called for:', item.title, 'Type:', 'items' in item ? 'collection' : 'episodes' in item ? 'series' : 'movie');
      
      if ('items' in item) {
        // Handle collection toggle
        console.log('🎬 Triggering collection toggle for:', item.title);
        await handleToggleCollection(item);
        return;
      }

      let itemType: 'movie' | 'series';
      let itemId: string;
      
      if ('episodes' in item) {
        itemType = 'series';
        itemId = item.id;
      } else {
        itemType = 'movie';
        itemId = item.id;
      }
    
      const response = await apiService.toggleWatched(itemType, itemId);
      
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }
    
      // Update the item locally instead of reloading entire list
      updateItemWatchedStatus(item, itemType);
      
      showToast('✅ Status updated', 'success');
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle watched status');
      console.error('Error toggling watched status:', err);
    }
  };

  // Update item watched status locally without full reload
  const updateItemWatchedStatus = (item: Movie | Series | Collection, itemType: 'movie' | 'series') => {
    if (!watchlistData) return;

    setWatchlistData(prevData => {
      if (!prevData) return prevData;

      const newData = { ...prevData };
      
      if (itemType === 'movie') {
        newData.movies = newData.movies.map(movie => 
          movie.id === item.id ? { ...movie, watched: !movie.watched } : movie
        );
        
        // Also update movies in collections
        newData.collections = newData.collections.map(collection => ({
          ...collection,
          items: collection.items.map(movie => 
            movie.id === item.id ? { ...movie, watched: !movie.watched } : movie
          )
        }));
      } else if (itemType === 'series') {
        // For series, the toggle affects all episodes, but we don't track a series-level watched status
        // The backend should handle toggling all episodes. Just update local data by refetching.
        // For now, we'll rely on the backend response and show a success message
        // The series watched state is computed from episodes, not stored directly
        // We should reload this series' data to get updated episode states
        console.log('Series toggle completed - episode states updated on backend');
      }

      return newData;
    });
  };

  // Handle collection toggle with proper logic
  const handleToggleCollection = async (collection: Collection) => {
    try {
      console.log('🎬 handleToggleCollection called for:', collection.title, 'with', collection.items.length, 'items');
      const watchedMovies = collection.items.filter(movie => movie.watched);
      const unwatchedMovies = collection.items.filter(movie => !movie.watched);
      console.log('🎬 Collection state:', watchedMovies.length, 'watched,', unwatchedMovies.length, 'unwatched');
      
      let action: 'mark_all_watched' | 'mark_all_unwatched' | 'ask_user';
      let message = '';
      
      if (watchedMovies.length === 0) {
        // All unwatched - mark all watched
        action = 'mark_all_watched';
        message = `Mark all ${collection.items.length} movies in "${collection.title}" as watched?`;
      } else if (unwatchedMovies.length === 0) {
        // All watched - mark all unwatched  
        action = 'mark_all_unwatched';
        message = `Mark all ${collection.items.length} movies in "${collection.title}" as unwatched?`;
      } else {
        // Mixed state - ask user
        action = 'ask_user';
        message = `"${collection.title}" has ${watchedMovies.length} watched and ${unwatchedMovies.length} unwatched movies. What would you like to do?`;
      }

      if (action === 'ask_user') {
        Alert.alert(
          'Collection Status',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: `Mark All Watched (${unwatchedMovies.length})`, 
              onPress: () => toggleCollectionMovies(collection, true)
            },
            { 
              text: `Mark All Unwatched (${watchedMovies.length})`, 
              onPress: () => toggleCollectionMovies(collection, false),
              style: 'destructive'
            },
          ]
        );
      } else {
        Alert.alert(
          'Confirm Collection Action',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Confirm', 
              onPress: () => toggleCollectionMovies(collection, action === 'mark_all_watched')
            },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to process collection toggle');
      console.error('Error in collection toggle:', err);
    }
  };

  // Toggle all movies in a collection
  const toggleCollectionMovies = async (collection: Collection, markAsWatched: boolean) => {
    try {
      const moviesToUpdate = markAsWatched 
        ? collection.items.filter(movie => !movie.watched)
        : collection.items.filter(movie => movie.watched);

      if (moviesToUpdate.length === 0) {
        showToast('✅ Collection already up to date', 'info');
        return;
      }

      showToast(`🔄 Updating ${moviesToUpdate.length} movies...`, 'info');

      // Update movies via API calls
      const updatePromises = moviesToUpdate.map(movie => 
        apiService.toggleWatched('movie', movie.id)
      );
      
      const results = await Promise.allSettled(updatePromises);
      
      // Check for failures
      const failures = results.filter(result => result.status === 'rejected').length;
      const successes = results.length - failures;

      if (failures > 0) {
        Alert.alert('Partial Success', `Updated ${successes} movies, ${failures} failed. Please try again for the failed items.`);
      } else {
        showToast(`✅ Updated ${successes} movies in collection`, 'success');
      }

      // Update local state for successful toggles
      setWatchlistData(prevData => {
        if (!prevData) return prevData;

        const newData = { ...prevData };
        
        // Update movies in main list
        newData.movies = newData.movies.map(movie => {
          const shouldUpdate = moviesToUpdate.some(updateMovie => updateMovie.id === movie.id);
          return shouldUpdate ? { ...movie, watched: markAsWatched } : movie;
        });
        
        // Update movies in collections
        newData.collections = newData.collections.map(col => ({
          ...col,
          items: col.items.map(movie => {
            const shouldUpdate = moviesToUpdate.some(updateMovie => updateMovie.id === movie.id);
            return shouldUpdate ? { ...movie, watched: markAsWatched } : movie;
          })
        }));

        return newData;
      });

    } catch (err) {
      Alert.alert('Error', 'Failed to update collection movies');
      console.error('Error updating collection movies:', err);
    }
  };

  // Load user lists from backend using new API structure
  const loadUserLists = async () => {
    try {
      console.log('🔄 Loading user lists...');
      const response = await apiService.getLists();
      console.log('📋 Lists API response:', response);
      
      if (response.data) {
        const listsData = response.data as ListsResponse;
        console.log('🔍 Processing listsData:', listsData);
        
        // The API returns all lists in a single 'lists' array
        const allLists: List[] = [];
        
        if (listsData.lists && Array.isArray(listsData.lists)) {
          listsData.lists.forEach((list: any) => {
            const processedList = {
              id: list.id.toString(), // Ensure ID is string
              name: list.name,
              description: list.description || '',
              type: list.type, // 'personal', 'custom', or 'shared'
              color: list.color,
              icon: list.icon,
              isActive: list.is_active === true || list.is_active === 1, // Handle both boolean and number
              is_active: list.is_active === true || list.is_active === 1,
              itemCount: list.item_count || 0,
              createdAt: new Date(list.created_at),
              created_at: list.created_at,
              updatedAt: list.updated_at ? new Date(list.updated_at) : undefined,
              deleted: list.deleted,
              owner_username: list.owner,
              permission_level: list.permission_level,
              background_color: list.background_color,
            };
            allLists.push(processedList);
            console.log(`✅ Processed list: ${processedList.name} (${processedList.type}) - ID: ${processedList.id}`);
          });
        } else {
          console.warn('⚠️ No lists found in API response or lists is not an array.');
        }
        
        console.log('🔍 allLists before setting state:', allLists);
        setLists(allLists);
        console.log(`✅ Loaded ${allLists.length} lists:`, allLists.map(l => `${l.name} (${l.type})`));
        console.log('📋 Full lists data:', allLists);
      } else if (response.error) {
        console.error('❌ Lists API error:', response.error);
      } else {
        console.warn('⚠️ No data in lists response');
      }
    } catch (error) {
      console.error('❌ Failed to load user lists:', error);
      // Fallback to default personal list
      setLists([{
        id: 'personal',
        name: 'My Watchlist',
        type: 'personal',
        isActive: true,
        itemCount: 0,
        createdAt: new Date(),
        description: 'Your personal watchlist',
        is_active: true,
        created_at: new Date().toISOString(),
      }]);
    }
  };

  // Create new list via backend using new API
  const handleCreateNewList = async (name: string, description?: string) => {
    try {
      const response = await apiService.createList({
        name,
        description,
        color: '#007AFF', // Default color
        background_color: '#1a1a2e', // Default background
        icon: '📋', // Default icon
      });
      
      if (response.data) {
        const newList: List = {
          id: response.data.id.toString(),
          name: response.data.name,
          type: 'custom',
          isActive: response.data.is_active,
          itemCount: 0,
          createdAt: new Date(response.data.created_at),
          description: response.data.description,
          color: response.data.color,
          background_color: response.data.background_color,
          icon: response.data.icon,
          is_active: response.data.is_active,
          created_at: response.data.created_at,
        };
        
        setLists(prev => [...prev, newList]);
        setNewListModalVisible(false);
        
        // Automatically select the new list and deselect others
        setSelectedListIds([newList.id]);
        setActiveListId(newList.id);
        
        // Load the new list's data
        loadListData(newList.id);
        
        // Show success message
        showToast(`List "${newList.name}" created and selected!`, 'success');
      }
    } catch (error) {
      console.error('Failed to create list:', error);
      showToast('Failed to create list', 'error');
    }
  };

  // Rename list via backend using new API
  const handleListRename = async (listId: string, newName: string) => {
    if (listId === 'personal') {
      showToast('Cannot rename personal list', 'error');
      return;
    }
    
    try {
      const response = await apiService.updateList(listId, {
        name: newName,
      });
      
      if (response.data) {
        setLists(prev => prev.map(list => 
          list.id === listId ? { ...list, name: newName } : list
        ));
        showToast('List renamed successfully!', 'success');
      }
    } catch (error) {
      console.error('Failed to rename list:', error);
      showToast('Failed to rename list', 'error');
    }
  };

  // Delete list via backend using new API
  const handleListDelete = async (listId: string) => {
    if (listId === 'personal') {
      showToast('Cannot delete personal list', 'error');
      return;
    }
    
    try {
      await apiService.deleteList(listId);
      
      // Remove from local state
      setLists(prev => prev.filter(list => list.id !== listId));
      setSelectedListIds(prev => prev.filter(id => id !== listId));
      
      // Clear list data
      setListData(prev => {
        const newData = { ...prev };
        delete newData[listId];
        return newData;
      });
      
      // Switch to personal list if deleted list was active
      if (activeListId === listId) {
        setActiveListId('personal');
        setSelectedListIds(['personal']);
      }
      
      showToast('List deleted successfully!', 'success');
    } catch (error) {
      console.error('Failed to delete list:', error);
      showToast('Failed to delete list', 'error');
    }
  };

  const handleListReorder = (fromIndex: number, toIndex: number) => {
    setLists(prevLists => {
      const newLists = [...prevLists];
      const [movedList] = newLists.splice(fromIndex, 1);
      newLists.splice(toIndex, 0, movedList);
      return newLists;
    });
  };

  // List sharing functions
  const handleListShare = (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (list && list.type !== 'shared') {
      setShareListTarget(list);
      setShareListModalVisible(true);
    }
  };

  const handleShareList = async (username: string, permissionLevel: 'view' | 'edit') => {
    if (!shareListTarget) return;

    try {
      await apiService.shareList(shareListTarget.id, {
        shared_with_username: username,
        permission_level: permissionLevel,
      });
      showToast(`List shared with ${username}`, 'success');
    } catch (error) {
      console.error('Failed to share list:', error);
      throw error;
    }
  };

  const handleUnshareList = async (username: string) => {
    if (!shareListTarget) return;

    try {
      await apiService.unshareList(shareListTarget.id, {
        shared_with_username: username,
      });
      showToast(`Access removed for ${username}`, 'success');
    } catch (error) {
      console.error('Failed to unshare list:', error);
      throw error;
    }
  };

  // Check for newly discovered items and show iOS push notifications
  const checkForNewContent = useCallback(() => {
    try {
      const newlyDiscoveredItems = getNewlyDiscoveredItems();
      
      if (newlyDiscoveredItems.length > 0) {
        // Show iOS push notification for new content
        PushNotificationIOS.addNotificationRequest({
          id: 'new_content',
          title: '🆕 New Content Discovered!',
          body: `${newlyDiscoveredItems.length} new item${newlyDiscoveredItems.length !== 1 ? 's' : ''} found in your watchlist!`,
          sound: 'default',
          badge: newlyDiscoveredItems.length,
          userInfo: {
            type: 'new_content',
            count: newlyDiscoveredItems.length,
          },
        });

        // Also show in-app toast
        showToast(`🆕 ${newlyDiscoveredItems.length} new item${newlyDiscoveredItems.length !== 1 ? 's' : ''} discovered!`, 'info');
      }
    } catch (error) {
      console.log('Error showing notification:', error);
      // Fall back to iOS alert if notification fails
      try {
        const newlyDiscoveredItems = getNewlyDiscoveredItems();
        if (newlyDiscoveredItems.length > 0) {
          Alert.alert(
            '🆕 New Content Discovered!',
            `${newlyDiscoveredItems.length} new item${newlyDiscoveredItems.length !== 1 ? 's' : ''} found in your watchlist!`,
            [
              {
                text: 'View Now',
                onPress: () => {
                  console.log('User wants to view new content');
                },
              },
              {
                text: 'Later',
                style: 'cancel',
              },
            ]
          );
        }
      } catch (alertError) {
        console.log('Error showing fallback alert:', alertError);
      }
    }
  }, []);

  const loadWatchlist = async () => {
    let cachedData: any = null;
    
    try {
      setLoading(true);
      setError(null);
      
      // OFFLINE-FIRST: Try to load from cache first
      cachedData = await loadFromCache();
      if (cachedData) {
        console.log('Loading from cache first...');
        console.log('🔍 CACHE DEBUG: Cached data structure:', {
          hasMovies: !!cachedData.movies,
          hasSeries: !!cachedData.series,
          hasCollections: !!cachedData.collections,
          moviesCount: cachedData.movies?.length || 0,
          seriesCount: cachedData.series?.length || 0,
          collectionsCount: cachedData.collections?.length || 0,
          dataKeys: Object.keys(cachedData)
        });
        setWatchlistData(cachedData);
        setLoading(false);
        setIsOffline(false);
        
        // Check for newly discovered content from cache
        setTimeout(() => {
          checkForNewContent();
        }, 500);
      }
      
      // Check connectivity
      const isOnline = await checkConnectivity();
      setIsOffline(!isOnline);
      
      if (!isOnline) {
        console.log('No internet connection, using cached data');
        if (!cachedData) {
          setError('No internet connection and no cached data available');
        }
        return;
      }
      
      // Get active sort and filter options
      const activeSort = sortOptions.find(sort => sort.active);
      const activeFilters = filterOptions.filter(filter => !filter.active).map(f => f.id);
      
      let sortParam: string | undefined;
      if (activeSort) {
        sortParam = activeSort.direction === 'desc' ? `-${activeSort.id}` : activeSort.id;
      }
      
      let filterParam: string | undefined;
      if (activeFilters.length > 0) {
        filterParam = activeFilters.join(',');
      }
      
      console.log('=== Loading Watchlist with Sort/Filter ===');
      console.log('Active sort:', activeSort);
      console.log('Sort parameter:', sortParam);
      console.log('Filter parameter:', filterParam);
      
      const response = await apiService.getWatchlistWithSort(sortParam, filterParam);
      
      if (response.error) {
        console.log('API error:', response.error);
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
        console.log('Received fresh data from API');
        console.log('🔍 API DATA DEBUG: API response structure:', {
          hasMovies: !!response.data.movies,
          hasSeries: !!response.data.series,
          hasCollections: !!response.data.collections,
          moviesCount: response.data.movies?.length || 0,
          seriesCount: response.data.series?.length || 0,
          collectionsCount: response.data.collections?.length || 0,
          dataKeys: Object.keys(response.data)
        });
        
        // Update personal list item count
        setLists(prevLists => 
          prevLists.map(list => 
            list.id === 'personal' 
              ? { ...list, itemCount: (response.data?.movies?.length || 0) + (response.data?.series?.length || 0) + (response.data?.collections?.length || 0) }
              : list
          )
        );
        
        // Debug: Log runtime data for movies
        if (response.data.movies) {
          console.log('=== Runtime Debug ===');
          response.data.movies.forEach(movie => {
            console.log(`${movie.title}: runtime = ${movie.runtime || 'undefined'}`);
          });
          console.log('===================');
        }
        
        // Set fresh data and cache it
        console.log('🔍 API DATA DEBUG: API response structure:', {
          hasMovies: !!response.data.movies,
          hasSeries: !!response.data.series,
          hasCollections: !!response.data.collections,
          moviesCount: response.data.movies?.length || 0,
          seriesCount: response.data.series?.length || 0,
          collectionsCount: response.data.collections?.length || 0,
          seriesStructure: response.data.series ? response.data.series.map(s => ({
            title: s.title,
            id: s.id,
            hasEpisodes: !!s.episodes,
            episodesCount: s.episodes?.length || 0,
            seriesKeys: Object.keys(s)
          })) : []
        });
        setWatchlistData(response.data);
        await saveToCache(response.data);
        
        // Check for newly discovered content and show notifications
        setTimeout(() => {
          checkForNewContent();
        }, 1000); // Small delay to ensure UI is rendered
        
        // Also load notifications to get latest count
        loadNotifications();
      }
    } catch (err) {
      console.error('Error loading watchlist:', err);
      
      // If we have cached data, show it instead of error
      if (cachedData) {
        console.log('API failed, but showing cached data');
        console.log('🔍 CACHE DEBUG: Using cached data structure:', {
          hasMovies: !!cachedData.movies,
          hasSeries: !!cachedData.series,
          hasCollections: !!cachedData.collections,
          moviesCount: cachedData.movies?.length || 0,
          seriesCount: cachedData.series?.length || 0,
          collectionsCount: cachedData.collections?.length || 0,
          dataKeys: Object.keys(cachedData)
        });
        setWatchlistData(cachedData);
        setError(null);
        setIsOffline(true);
      } else {
        setError('Failed to load watchlist');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  // Remove the useEffect that reloads on filter/sort changes since filtering is client-side

  const onRefresh = () => {
    setRefreshing(true);
    console.log('🔄 Pull to refresh triggered - reloading lists and watchlist');
    loadUserLists(); // Reload the lists from backend
    loadWatchlist(); // Reload the current watchlist data
  };

  const handleItemPress = (item: any) => {
    let itemType: 'movie' | 'series' | 'collection';
    let itemId: string;

    if ('items' in item) {
      itemType = 'collection';
      itemId = item.id;
    } else if ('episodes' in item) {
      itemType = 'series';
      itemId = item.id;
    } else {
      itemType = 'movie';
      itemId = item.id;
    }

    navigation.navigate('Details', {
      itemId,
      itemType,
    });
  };



  const handleDelete = (item: Movie | Series | Collection, collectionContext?: Collection) => {
    let itemType: 'movie' | 'series';
    let itemId: string;
    let itemTitle: string;

    if ('items' in item) {
      // For collections, we'll handle this in the details screen
      return;
    } else if ('episodes' in item) {
      itemType = 'series';
      itemId = item.id;
      itemTitle = item.title;
    } else {
      itemType = 'movie';
      itemId = item.id;
      itemTitle = item.title;
    }

    // If we're deleting from within a collection context
    if (collectionContext) {
      Alert.alert(
        'Remove from Collection',
        `Are you sure you want to remove "${itemTitle}" from the "${collectionContext.title}" collection?`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                const response = await apiService.removeFromCollection(collectionContext.id.toString(), itemId);
                
                if (response.error) {
                  Alert.alert('Error', response.error);
                  return;
                }

                // Reload the watchlist to get updated data
                loadWatchlist();
                showToast(`Removed "${itemTitle}" from collection`, 'success');
              } catch (err) {
                Alert.alert('Error', 'Failed to remove item from collection');
                console.error('Error removing item from collection:', err);
              }
            },
          },
        ],
      );
      return;
    }

    // Regular delete from watchlist
    Alert.alert(
      'Delete Item',
      `Are you sure you want to remove "${itemTitle}" from your watchlist?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deleteItem(itemType, itemId);
              
              if (response.error) {
                Alert.alert('Error', response.error);
                return;
              }

              // Reload the watchlist to get updated data
              loadWatchlist();
              showToast(`Removed "${itemTitle}" from watchlist`, 'success');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete item');
              console.error('Error deleting item:', err);
            }
          },
        },
      ],
    );
  };

  // Omnibox handlers - Updated to use new unified search API
  const handleImport = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      setIsSearchingResults(true);
      setSearchResultsVisible(true);
      
      // Use the new unified search API endpoint
      const response = await apiService.searchAll(query.trim());
      
      console.log('=== Unified Search Debug ===');
      console.log('Search query:', query.trim());
      console.log('Search response:', response);
      console.log('============================');
      
      if (response.data && response.data.length > 0) {
        console.log('Search results found:', response.data.length, 'items');
        
        // Debug: Log the structure of the first result
        console.log('Sample result structure:', response.data[0]);
        console.log('Sample result keys:', Object.keys(response.data[0]));
        
        setSearchResults(response.data);
      } else if (response.error) {
        console.log('Search error:', response.error);
        showToast(`Search failed: ${response.error}`, 'error');
        setSearchResultsVisible(false);
      } else {
        // If no results found, show a toast message
        showToast(`No movies or TV series found for "${query.trim()}". Please try a different search term.`, 'info');
        setSearchResultsVisible(false);
      }
      setIsSearchingResults(false);
      
    } catch (error) {
      showToast('Failed to search external databases. Please check your connection and try again.', 'error');
      console.error('Import search error:', error);
      setIsSearchingResults(false);
      setSearchResultsVisible(false);
    }
  };

  const handleImportSelection = async (selectedItem: any) => {
    // Show the multi-list import modal instead of importing directly
    setImportTargetItem(selectedItem);
    setImportToListsModalVisible(true);
    setSearchResultsVisible(false);
  };

  const handleImportToLists = async (targetListIds: string[]) => {
    if (!importTargetItem) return;

    try {
      console.log('Importing item to lists:', importTargetItem, targetListIds);
      
      showToast(`Importing "${importTargetItem.title}"...`, 'info');
      
      // Use imdb_id as the identifier, with fallback to id
      const itemId = importTargetItem.imdb_id || importTargetItem.id;
      
      if (!itemId) {
        console.error('No valid ID found for item:', importTargetItem);
        showToast('No valid ID found for this item', 'error');
        return;
      }

      // Import to each selected list
      let successCount = 0;
      let errors: string[] = [];

                // Import to all selected lists at once using the new backend functionality
          const response = await apiService.importItem(
            itemId.toString(),
            importTargetItem.type,
            targetListIds
          );
          
          if (response.error) {
            showToast(`Import failed: ${response.error}`, 'error');
          } else {
            successCount = targetListIds.length;
            showToast(
              `"${importTargetItem.title}" imported to ${successCount} list${successCount !== 1 ? 's' : ''}!`,
              'success'
            );
            
            // Reload watchlist and list data
            loadWatchlist();
            targetListIds.forEach(listId => {
              if (listId !== 'personal') {
                loadListData(listId);
              }
            });
          }

      // Success/error handling is now done above
      
    } catch (error) {
      console.error('Import error:', error);
      showToast('Failed to import item. Please try again.', 'error');
    }
  };

  const handleSearch = (query: string) => {
    // Filter the current watchlist data based on the search query
    if (!query.trim()) {
      setSearchQuery('');
      setIsSearching(false);
      return;
    }
    
    setSearchQuery(query.trim());
    setIsSearching(true);
    
    // Get filtered results for feedback - use the passed query parameter
    const filteredData = getFlatListData().filter(item => {
      const title = item.title?.toLowerCase() || '';
      const searchTerm = query.toLowerCase();
      return title.includes(searchTerm);
    });
    
    // No confirmation dialog - just filter silently
    if (filteredData.length === 0) {
      // Optional: Show a brief toast or just let it be empty
      console.log(`No items found matching "${query}"`);
    }
  };

  const handleSearchModeChange = (isSearch: boolean) => {
    setIsSearchMode(isSearch);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
  };

  // Menu handlers - allow multiple menus to be open simultaneously
  const handleSortMenuToggle = () => {
    setSortActive(!sortActive);
  };

  const handleFilterMenuToggle = () => {
    setFilterActive(!filterActive);
  };

  const handleListMenuToggle = () => {
    setListActive(!listActive);
  };

  const handleImportFromJellyfin = async () => {
    try {
      setImportingFromJellyfin(true);
      
      // Get available libraries using new API
      console.log('🔄 Fetching Jellyfin libraries...');
      const response = await apiService.getJellyfinLibraries();
      console.log('📚 Jellyfin response:', response);
      
      if (response.error) {
        console.error('❌ Jellyfin error:', response.error);
        Alert.alert('Error', `Failed to get Jellyfin libraries: ${response.error}`);
        return;
      }
      
      // Extract libraries array from the response structure
      const librariesArray = response.data?.libraries || response.data;
      
      if (!librariesArray || !Array.isArray(librariesArray) || librariesArray.length === 0) {
        console.log('⚠️ No libraries found:', response.data);
        Alert.alert('No Libraries', 'No Jellyfin libraries found');
        return;
      }
      
      console.log(`✅ Found ${librariesArray.length} libraries:`, librariesArray);
      
      // Store full library data for the enhanced modal
      setJellyfinLibraries(librariesArray);
      setJellyfinModalVisible(true);
      
    } catch (error) {
      console.error('❌ Jellyfin libraries error:', error);
      Alert.alert('Error', 'Failed to get Jellyfin libraries');
      // Don't show modal on error
      setJellyfinModalVisible(false);
    } finally {
      setImportingFromJellyfin(false);
    }
  };

  const handleJellyfinImport = async (libraryName: string, targetListIds: string[]) => {
    try {
      setJellyfinModalVisible(false);
      setImportingFromJellyfin(true);
      
      showToast('Starting Jellyfin import...', 'info');
      
      const response = await apiService.importFromJellyfinToLists({
        library_name: libraryName,
        // send both keys for backend compatibility
        target_list_ids: targetListIds,
      });
      
      if (response.error) {
        Alert.alert('Import Failed', `Jellyfin import failed: ${response.error}`);
        return;
      }
      
      if (response.data) {
        console.log('Jellyfin import response data:', response.data);
        
        // Handle different response formats
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        
        if (typeof response.data === 'object' && response.data !== null) {
          imported = response.data.imported || response.data.imported_count || 0;
          updated = response.data.updated || response.data.updated_count || 0;
          skipped = response.data.skipped || response.data.skipped_count || 0;
        }
        
        showToast(`✅ Jellyfin import complete. Imported ${imported}, updated ${updated}, skipped ${skipped}.`, 'success');
        
        // Reload the watchlist and all affected list data
        loadWatchlist();
        targetListIds.forEach(listId => {
          if (listId !== 'personal') {
            loadListData(listId);
          }
        });
      }
      
    } catch (error) {
      Alert.alert('Import Failed', 'Jellyfin import failed');
      console.error('Jellyfin import error:', error);
    } finally {
      setImportingFromJellyfin(false);
    }
  };

  const handleAccount = () => {
    navigation.navigate('Account');
  };

  // Filter and sort handlers
  const handleFilterToggle = (filterId: string) => {
    console.log(`Toggling filter: ${filterId}`);
    setFilterOptions(prev => 
      prev.map(filter => 
        filter.id === filterId 
          ? {...filter, active: !filter.active}
          : filter
      )
    );
    
    // No need to reload data - filtering happens client-side
    console.log('Filter state updated, re-rendering with new filters');
  };



    const handleSortToggle = (sortId: string) => {
    setSortOptions(prev =>
      prev.map(sort =>
        sort.id === sortId
          ? {
              ...sort, 
              active: true,
              direction: sort.active ? (sort.direction === 'asc' ? 'desc' : 'asc') : 'asc'
            }
          : {...sort, active: false}
      )
    );
  };

  const renderItem = ({item}: {item: any}) => (
    <WatchlistItem
      item={item}
      onPress={() => handleItemPress(item)}
      onToggleWatched={() => handleToggleWatched(item)}
    />
  );

  const getNewlyDiscoveredItems = () => {
    if (!watchlistData) return [];

    // ONLY show items where the nightly checker has set is_new = true
    // This flag is ONLY set by the nightly checker, not by manual import
    let items: any[] = [];
    
    // Check collections for is_new flag (set by nightly checker for new sequels)
    if (watchlistData.collections) {
      for (const collection of watchlistData.collections) {
        if ((collection as any).is_new === true) {
          items.push({ ...collection, _itemType: 'collection' });
        }
      }
    }
    
    // Check series for is_new flag (set by nightly checker for new episodes)
    if (watchlistData.series) {
      for (const series of watchlistData.series) {
        if ((series as any).is_new === true) {
          items.push({ ...series, _itemType: 'series' });
        }
      }
    }
    
    // Check standalone movies for is_new flag (set by nightly checker for new sequels)
    if (watchlistData.movies) {
      for (const movie of watchlistData.movies) {
        if ((movie as any).is_new === true) {
          items.push({ ...movie, _itemType: 'movie' });
        }
      }
    }

    console.log(`Found ${items.length} newly discovered items (nightly checker only)`);
    return items;
  };

  // Enhanced getFlatListData function that handles both personal watchlist and custom lists
  const getFlatListData = () => {
    console.log(`🔍 GETFLATLISTDATA CALLED: watchlistData exists: ${!!watchlistData}, selectedListIds:`, selectedListIds);
    // Determine which data source to use based on selected lists
    let dataSource: WatchlistData | null = null;
    
    if (selectedListIds.length === 1 && selectedListIds[0] === 'personal') {
      // Only personal list selected - use main watchlist data
      dataSource = watchlistData;
    } else if (selectedListIds.length === 1 && selectedListIds[0] !== 'personal') {
      // Single custom list selected - use list-specific data
      dataSource = listData[selectedListIds[0]] || null;
    } else if (selectedListIds.length > 1) {
      // Multiple lists selected - merge data from all selected lists
      const mergedData: WatchlistData = { movies: [], series: [], collections: [] };
      
      for (const listId of selectedListIds) {
        let listItems: WatchlistData | null = null;
        
        if (listId === 'personal') {
          listItems = watchlistData;
        } else {
          listItems = listData[listId] || null;
        }
        
        if (listItems) {
          if (listItems.movies) mergedData.movies.push(...listItems.movies);
          if (listItems.series) mergedData.series.push(...listItems.series);
          if (listItems.collections) mergedData.collections.push(...listItems.collections);
        }
      }
      
      dataSource = mergedData;
    }
    
    if (!dataSource) {
      console.log('🔍 LIST DEBUG: No data source available');
      console.log('🔍 LIST DEBUG: watchlistData exists:', !!watchlistData);
      console.log('🔍 LIST DEBUG: selectedListIds:', selectedListIds);
      return [];
    }

    console.log(`🔍 LIST DEBUG: Using data source with ${dataSource.movies?.length || 0} movies, ${dataSource.series?.length || 0} series, ${dataSource.collections?.length || 0} collections`);
    console.log(`🔍 LIST DEBUG: Selected list IDs:`, selectedListIds);
    console.log(`🔍 LIST DEBUG: Data source keys:`, Object.keys(dataSource));
    console.log(`🔍 LIST DEBUG: Data source structure:`, {
      hasMovies: !!dataSource.movies,
      hasSeries: !!dataSource.series,
      hasCollections: !!dataSource.collections,
      moviesType: typeof dataSource.movies,
      seriesType: typeof dataSource.series,
      collectionsType: typeof dataSource.collections
    });

    // Create flat array with type info - match web app exactly
    let items: any[] = [];
    
    // Add collections
    if (dataSource.collections) {
      for (const collection of dataSource.collections) {
        items.push({ ...collection, _itemType: 'collection' });
      }
    }
    
    // Add series
    if (dataSource.series) {
      console.log(`🔍 SERIES DEBUG: Found ${dataSource.series.length} series in data source`);
      for (const series of dataSource.series) {
        console.log(`🔍 SERIES DEBUG: Adding series "${series.title}" with ID ${series.id}`);
        console.log(`🔍 SERIES DEBUG: Series structure:`, {
          title: series.title,
          id: series.id,
          hasEpisodes: !!series.episodes,
          episodesCount: series.episodes?.length || 0,
          episodesType: typeof series.episodes,
          seriesKeys: Object.keys(series)
        });
        items.push({ ...series, _itemType: 'series' });
      }
    } else {
      console.log(`🔍 SERIES DEBUG: No series data in data source`);
    }
    
    // Add standalone movies
    if (dataSource.movies) {
      for (const movie of dataSource.movies) {
        items.push({ ...movie, _itemType: 'movie' });
      }
    }

    console.log(`Total items before filtering: ${items.length}`);

    // SIMPLE DEDUPLICATION: Remove duplicates by ID only
    const seenIds = new Set();
    const originalCount = items.length;
    items = items.filter(item => {
      if (item.id && seenIds.has(item.id)) {
        return false; // Remove duplicate
      }
      if (item.id) seenIds.add(item.id);
      return true;
    });
    
    if (items.length < originalCount) {
      console.log(`Removed ${originalCount - items.length} duplicate items`);
    }

    // Filter by type - match web app exactly
    console.log(`🔍 TYPE FILTER DEBUG: Filtering ${items.length} items by type`);
    console.log(`🔍 TYPE FILTER DEBUG: Filter options:`, filterOptions.map(f => `${f.id}: ${f.active}`));
    
    const beforeTypeFilter = items.length;
    items = items.filter(item => {
      const isCollection = item._itemType === 'collection';
      const isSeries = item._itemType === 'series';
      const isMovie = item._itemType === 'movie';
      
      const moviesFilterActive = filterOptions.find(f => f.id === 'movies')?.active;
      const seriesFilterActive = filterOptions.find(f => f.id === 'series')?.active;
      
      console.log(`🔍 FILTER DEBUG: ${item.title} - Type: ${item._itemType}, MoviesActive: ${moviesFilterActive}, SeriesActive: ${seriesFilterActive}`);
      
      if (isCollection && !moviesFilterActive) {
        console.log(`🔍 TYPE FILTER: Filtering out collection "${item.title}" (movies filter inactive)`);
        return false;
      }
      if (isSeries && !seriesFilterActive) {
        console.log(`🔍 TYPE FILTER: Filtering out series "${item.title}" (series filter inactive)`);
        return false;
      }
      if (isMovie && !moviesFilterActive) {
        console.log(`🔍 TYPE FILTER: Filtering out movie "${item.title}" (movies filter inactive)`);
        return false;
      }
      
      console.log(`🔍 TYPE FILTER: Keeping ${item._itemType} "${item.title}"`);
      return true;
    });
    
    console.log(`🔍 TYPE FILTER DEBUG: After type filtering: ${items.length} items (removed ${beforeTypeFilter - items.length})`);

    // Filter by watched status
    items = items.filter(item => {
      const unwatchedOnly = filterOptions.find(f => f.id === 'unwatched')?.active;
      
      if (item._itemType === 'collection') {
        // For collections, check if any movie matches the watched filter
        if (unwatchedOnly) {
          // Show only if any movie is unwatched
          return item.items && item.items.some((movie: any) => !movie.watched);
        } else {
          // Show all collections (both watched and unwatched)
          return true;
        }
      } else {
        // For movies and series, check watched status directly
        if (unwatchedOnly) {
          // Show only unwatched items
          return !item.watched;
        } else {
          // Show all items (both watched and unwatched)
          return true;
        }
      }
    });

    // Filter by runtime
    console.log(`🔍 RUNTIME FILTER DEBUG: Starting runtime filtering with ${items.length} items`);
    items = items.filter(item => {
      if (item._itemType === 'collection') {
        // For collections, check if any movie matches runtime criteria
        return item.items && item.items.some((movie: any) => {
          const runtime = movie.runtime;
          
          const under30 = filterOptions.find(f => f.id === 'runtime_under_30')?.active;
          const over30 = filterOptions.find(f => f.id === 'runtime_30_60')?.active;
          const over60 = filterOptions.find(f => f.id === 'runtime_60_90')?.active;
          const over90 = filterOptions.find(f => f.id === 'runtime_over_90')?.active;
          
          // If any runtime filter is enabled, show the movie if it matches ANY of them
          if (under30 || over30 || over60 || over90) {
            // If movie has no runtime data, include it anyway (don't filter out)
            if (!runtime || runtime === 0) return true;
            
            if (under30 && runtime < 30) return true;
            if (over30 && runtime >= 30 && runtime <= 60) return true;
            if (over60 && runtime > 60 && runtime <= 90) return true;
            if (over90 && runtime > 90) return true;
            return false;
          } else {
            // No runtime filters enabled, show everything
            return true;
          }
        });
      } else if (item._itemType === 'series') {
        console.log(`🔍 RUNTIME FILTER DEBUG: Processing series "${item.title}" with ${item.episodes?.length || 0} episodes`);
        // For series, use the shortest episode runtime for filtering (like collections)
        if (item.episodes && item.episodes.length > 0) {
          const validRuntimes = item.episodes
            .map((episode: any) => episode.runtime)
            .filter((runtime: number) => runtime && runtime > 0);
          
          const under30 = filterOptions.find(f => f.id === 'runtime_under_30')?.active;
          const over30 = filterOptions.find(f => f.id === 'runtime_30_60')?.active;
          const over60 = filterOptions.find(f => f.id === 'runtime_60_90')?.active;
          const over90 = filterOptions.find(f => f.id === 'runtime_over_90')?.active;
          
          // If any runtime filter is enabled, show the series if it matches ANY of them
          if (under30 || over30 || over60 || over90) {
            // If series has no valid runtime data, include it anyway (don't filter out)
            if (validRuntimes.length === 0) return true;
            
            const shortestRuntime = Math.min(...validRuntimes);
            
            if (under30 && shortestRuntime < 30) return true;
            if (over30 && shortestRuntime >= 30 && shortestRuntime <= 60) return true;
            if (over60 && shortestRuntime > 60 && shortestRuntime <= 90) return true;
            if (over90 && shortestRuntime > 90) return true;
            return false;
          } else {
            // No runtime filters enabled, show everything
            return true;
          }
        } else {
          // If series has no episodes, include it (don't filter out)
          return true;
        }
      } else {
        // For movies, check runtime directly
        const runtime = item.runtime;
        
        const under30 = filterOptions.find(f => f.id === 'runtime_under_30')?.active;
        const over30 = filterOptions.find(f => f.id === 'runtime_30_60')?.active;
        const over60 = filterOptions.find(f => f.id === 'runtime_60_90')?.active;
        const over90 = filterOptions.find(f => f.id === 'runtime_over_90')?.active;
        
        // If any runtime filter is enabled, show the movie if it matches ANY of them
        if (under30 || over30 || over60 || over90) {
          // If movie has no runtime data, include it anyway (don't filter out)
          if (!runtime || runtime === 0) return true;
          
          if (under30 && runtime < 30) return true;
          if (over30 && runtime >= 30 && runtime <= 60) return true;
          if (over60 && runtime > 60 && runtime <= 90) return true;
          if (over90 && runtime > 90) return true;
          return false;
        } else {
          // No runtime filters enabled, show everything
          return true;
        }
      }
    });
    
    console.log(`🔍 RUNTIME FILTER DEBUG: After runtime filtering: ${items.length} items`);
    console.log(`🔍 RUNTIME FILTER DEBUG: Items by type after runtime filtering:`);
    const typeCounts = items.reduce((acc, item) => {
      acc[item._itemType] = (acc[item._itemType] || 0) + 1;
      return acc;
    }, {} as any);
    console.log(`🔍 RUNTIME FILTER DEBUG: Type counts:`, typeCounts);

    // Apply sorting
    const activeSort = sortOptions.find(sort => sort.active);
    console.log(`🔍 SORT DEBUG: activeSort =`, activeSort);
    console.log(`🔍 SORT DEBUG: All sort options:`, sortOptions);
    
    if (activeSort) {
      console.log(`🔍 SORT DEBUG: About to sort ${items.length} items by ${activeSort.id} with direction ${activeSort.direction}`);
      
      // Show first 5 items before sorting
      console.log(`🔍 SORT DEBUG: First 5 items BEFORE sorting:`);
      items.slice(0, 5).forEach((item, index) => {
        let displayDate = item.release_date;
        if (item._itemType === 'collection' && 'items' in item && item.items && item.items.length > 0) {
          const dates = item.items.map((movie: Movie) => movie.release_date).filter((date: string) => date);
          displayDate = dates.length > 0 ? `Collection: ${dates.sort().pop()!}` : 'No dates';
        }
        console.log(`  ${index + 1}. ${item.title} - ${displayDate} - Type: ${item._itemType}`);
      });
      
      // Also show a few items with their full data structure
      console.log(`🔍 SORT DEBUG: Sample item data structure:`, items[0]);
      
      console.log(`🔍 SORT DEBUG: About to call items.sort() with ${items.length} items`);
      items = items.sort((a, b) => {
        console.log(`🔍 SORT DEBUG: Comparing items: "${a.title}" vs "${b.title}"`);
        switch (activeSort.id) {
          case 'title':
            return activeSort.direction === 'asc' 
              ? a.title.localeCompare(b.title)
              : b.title.localeCompare(a.title);
          case 'date':
            const aDate = a.added_at ? new Date(a.added_at) : new Date(0);
            const bDate = b.added_at ? new Date(b.added_at) : new Date(0);
            return activeSort.direction === 'desc' 
              ? bDate.getTime() - aDate.getTime()
              : aDate.getTime() - bDate.getTime();
          case 'type':
            return activeSort.direction === 'asc'
              ? a._itemType.localeCompare(b._itemType)
              : b._itemType.localeCompare(a._itemType);
          case 'release_date':
            // Handle collections vs individual items for release date sorting
            let aReleaseDate: string | null = null;
            let bReleaseDate: string | null = null;

            if (a._itemType === 'collection' && 'items' in a && a.items && a.items.length > 0) {
              // Collection: find most recent release date among all movies
              const aDates = a.items
                .map((movie: Movie) => movie.release_date)
                .filter((date: string) => date && date.trim() !== '');
              
              if (aDates.length > 0) {
                // Sort dates and get the most recent one
                aDates.sort((date1: string, date2: string) => {
                  const year1 = parseInt(date1.substring(0, 4) || '0');
                  const year2 = parseInt(date2.substring(0, 4) || '0');
                  return year2 - year1; // Descending to get most recent first
                });
                aReleaseDate = aDates[0];
              }
              console.log(`🔍 COLLECTION A: "${a.title}" - most recent date: ${aReleaseDate} from ${aDates.length} movies`);
            } else {
              // Individual movie/series
              aReleaseDate = a.release_date && a.release_date.trim() !== '' ? a.release_date : null;
            }

            if (b._itemType === 'collection' && 'items' in b && b.items && b.items.length > 0) {
              // Collection: find most recent release date among all movies
              const bDates = b.items
                .map((movie: Movie) => movie.release_date)
                .filter((date: string) => date && date.trim() !== '');
              
              if (bDates.length > 0) {
                // Sort dates and get the most recent one
                bDates.sort((date1: string, date2: string) => {
                  const year1 = parseInt(date1.substring(0, 4) || '0');
                  const year2 = parseInt(date2.substring(0, 4) || '0');
                  return year2 - year1; // Descending to get most recent first
                });
                bReleaseDate = bDates[0];
              }
              console.log(`🔍 COLLECTION B: "${b.title}" - most recent date: ${bReleaseDate} from ${bDates.length} movies`);
            } else {
              // Individual movie/series
              bReleaseDate = b.release_date && b.release_date.trim() !== '' ? b.release_date : null;
            }

            console.log(`🔍 SORTING DEBUG: Item A: "${a.title}" - release_date: "${aReleaseDate}" - type: ${a._itemType}`);
            console.log(`🔍 SORTING DEBUG: Item B: "${b.title}" - release_date: "${bReleaseDate}" - type: ${b._itemType}`);
            
            // Handle cases where dates are missing
            if (!aReleaseDate && !bReleaseDate) return 0; // Both missing, no change
            if (!aReleaseDate) return 1; // A missing, put at end
            if (!bReleaseDate) return -1; // B missing, put at end
            
            // Parse years, with better error handling
            const aYear = parseInt(aReleaseDate.substring(0, 4));
            const bYear = parseInt(bReleaseDate.substring(0, 4));
            
            // Check if parsing failed
            if (isNaN(aYear) || isNaN(bYear)) {
              console.log(`🔍 SORTING ERROR: Invalid year parsing - A: ${aReleaseDate} -> ${aYear}, B: ${bReleaseDate} -> ${bYear}`);
              return 0; // Fallback to no change
            }
            
            console.log(`🔍 SORTING: "${a.title}" (${aReleaseDate}) year: ${aYear} vs "${b.title}" (${bReleaseDate}) year: ${bYear}, direction: ${activeSort.direction}`);
            
            if (activeSort.direction === 'desc') {
              // Down arrow = oldest first (ascending)
              const result = aYear - bYear;
              console.log(`🔍 DOWN ARROW (oldest first): ${result} (${aYear} - ${bYear})`);
              return result;
            } else {
              // Up arrow = newest first (descending)
              const result = bYear - aYear;
              console.log(`🔍 UP ARROW (newest first): ${result} (${bYear} - ${aYear})`);
              return result;
            }
          default:
            return 0;
        }
      });
      
      // Show first 5 items after sorting
      console.log(`🔍 SORT DEBUG: First 5 items AFTER sorting:`);
      items.slice(0, 5).forEach((item, index) => {
        let displayDate = item.release_date;
        if (item._itemType === 'collection' && 'items' in item && item.items && item.items.length > 0) {
          const dates = item.items.map((movie: Movie) => movie.release_date).filter((date: string) => date);
          displayDate = dates.length > 0 ? `Collection: ${dates.sort().pop()!}` : 'No dates';
        }
        console.log(`  ${index + 1}. ${item.title} - ${displayDate} - Type: ${item._itemType}`);
      });
        }
    
    console.log(`Final filtered items: ${items.length}`);
    
    // Debug: Show final item counts by type
    const finalTypeCounts = items.reduce((acc, item) => {
      acc[item._itemType] = (acc[item._itemType] || 0) + 1;
      return acc;
    }, {} as any);
    console.log(`🔍 FINAL RESULT: Items by type:`, finalTypeCounts);
    
    // Apply search filtering if search query exists
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.toLowerCase();
      const beforeSearchCount = items.length;
      
      items = items.filter(item => {
        const title = item.title?.toLowerCase() || '';
        
        // For collections, also search through movie titles within the collection
        if (item._itemType === 'collection' && item.items) {
          const collectionMatch = title.includes(searchTerm);
          const movieMatch = item.items.some((movie: any) => 
            movie.title?.toLowerCase().includes(searchTerm)
          );
          return collectionMatch || movieMatch;
        }
        
        // For series, also search through episode titles if available
        if (item._itemType === 'series' && item.episodes) {
          const seriesMatch = title.includes(searchTerm);
          const episodeMatch = item.episodes.some((episode: any) => 
            episode.title?.toLowerCase().includes(searchTerm)
          );
          return seriesMatch || episodeMatch;
        }
        
        // For movies and other items, just check the title
        return title.includes(searchTerm);
      });
      
      console.log(`🔍 SEARCH FILTER: Filtered from ${beforeSearchCount} to ${items.length} items using query: "${searchQuery}"`);
    }
    
    // Debug: Show first 10 items in sorted order
    if (activeSort && activeSort.id === 'release_date') {
      console.log('🔍 First 10 items in release date order:');
      items.slice(0, 10).forEach((item, index) => {
        let displayDate = item.release_date;
        let year = 'Unknown';
        
        if (item._itemType === 'collection' && 'items' in item && item.items && item.items.length > 0) {
          const dates = item.items.map((movie: Movie) => movie.release_date).filter((date: string) => date);
          displayDate = dates.length > 0 ? `Collection: ${dates.sort().pop()!}` : 'No dates';
          year = dates.length > 0 ? dates.sort().pop()!.substring(0, 4) : 'Unknown';
        } else {
          year = item.release_date?.substring(0, 4) || 'Unknown';
        }
        
        console.log(`  ${index + 1}. ${item.title} - ${displayDate} (Year: ${year})`);
      });
    }
    
    return items;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading watchlist...</Text>
      </View>
    );
  }

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

  // Only get data if we have watchlist data loaded
  const data = watchlistData ? getFlatListData() : [];

  return (
    <View style={[styles.container, isSearchMode && styles.searchModeContainer]}>
      {/* Header with hamburger menu */}
      <LinearGradient
        colors={['#2a0a2a', '#2a0a2a', '#00d4aa']}
        locations={[0, 0.4, 1]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={styles.header}>
        <View style={styles.headerContent}>
                          <Text style={styles.headerTitle}>ViewVault</Text>
          <View style={styles.headerButtons}>
            {/* Notification Button */}
            {(() => {
              const bellState = getNotificationBellState();
              if (!bellState.visible) return null;
              
              return (
                <TouchableOpacity
                  style={styles.notificationButton}
                  onPress={handleNotificationPress}>
                  <Text style={[
                    styles.notificationIcon,
                    bellState.style === 'outline' && styles.notificationIconOutline,
                    bellState.style === 'active' && styles.notificationIconActive
                  ]}>
                    {bellState.icon}
                  </Text>
                  {notificationCount > 0 && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationBadgeText}>
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })()}
            {/* Menu Button */}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMenuVisible(true)}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>



      {/* Omnibox */}
      <Omnibox 
        onImport={handleImport} 
        onSearch={handleSearch} 
        onClearSearch={handleClearSearch}
        isSearching={isSearching}
        onSearchModeChange={handleSearchModeChange}
        isOffline={isOffline}
      />

      {/* Filter and Sort Chips */}
      {filterActive && (
        <FilterChips filters={filterOptions} onFilterToggle={handleFilterToggle} isSearchMode={isSearchMode} />
      )}
      {sortActive && (
        <SortChips sorts={sortOptions} onSortToggle={handleSortToggle} isSearchMode={isSearchMode} />
      )}

      {/* List Selector */}
      {listActive && (
        <ListSelector
          lists={lists}
          activeListId={activeListId}
          selectedListIds={selectedListIds}
          onListSelect={handleListSelect}
          onCreateNewList={() => setNewListModalVisible(true)}
          onListMenuOpen={() => setListMenuModalVisible(true)}
        />
      )}

      {/* Newly Discovered Section */}
      {(() => {
        const newlyDiscoveredItems = getNewlyDiscoveredItems();
        if (newlyDiscoveredItems.length > 0) {
          return (
            <View style={styles.newlyDiscoveredSection}>
              <View style={styles.newlyDiscoveredHeader}>
                <Text style={styles.newlyDiscoveredTitle}>🆕 Newly Discovered</Text>
                <Text style={styles.newlyDiscoveredSubtitle}>
                  {newlyDiscoveredItems.length} new item{newlyDiscoveredItems.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.newlyDiscoveredItems}>
                {newlyDiscoveredItems.map((item) => (
                  <WatchlistItem
                    key={`new-${item.id}`}
                    item={item}
                    onPress={() => handleItemPress(item)}
                    onToggleWatched={() => handleToggleWatched(item)}
                  />
                ))}
              </View>
            </View>
          );
        }
        return null;
      })()}

      {/* Watchlist */}
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

      {/* Hamburger Menu */}
      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onSortToggle={handleSortMenuToggle}
        onFilterToggle={handleFilterMenuToggle}
        onListToggle={handleListMenuToggle}
        onImportFromJellyfin={handleImportFromJellyfin}
        onAccount={handleAccount}
        sortActive={sortActive}
        filterActive={filterActive}
        listActive={listActive}
      />

      {/* Enhanced Jellyfin Import Modal */}
      <JellyfinImportModal
        visible={jellyfinModalVisible}
        onClose={() => setJellyfinModalVisible(false)}
        libraries={jellyfinLibraries}
        lists={lists}
        onImport={handleJellyfinImport}
      />

      {/* Search Results Modal */}
      <SearchResultsModal
        visible={searchResultsVisible}
        results={searchResults}
        searchQuery={searchQuery}
        isLoading={isSearchingResults}
        onClose={() => setSearchResultsVisible(false)}
        onImport={handleImportSelection}
      />

      {/* Toast Notification */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      {/* New List Modal */}
      <NewListModal
        visible={newListModalVisible}
        onClose={() => setNewListModalVisible(false)}
        onCreateList={handleCreateNewList}
      />

      {/* List Menu Modal */}
      <ListMenuModal
        visible={listMenuModalVisible}
        onClose={() => setListMenuModalVisible(false)}
        lists={lists}
        activeListId={activeListId}
        selectedListIds={selectedListIds}
        onListSelect={handleListSelect}
        onListRename={handleListRename}
        onListDelete={handleListDelete}
        onListReorder={handleListReorder}
        onListShare={handleListShare}
      />

      {/* Share List Modal */}
      <ShareListModal
        visible={shareListModalVisible}
        onClose={() => {
          setShareListModalVisible(false);
          setShareListTarget(null);
        }}
        list={shareListTarget}
        onShare={handleShareList}
        onUnshare={handleUnshareList}
        sharedWith={[]} // TODO: Load shared users from API
      />

      {/* Import to Lists Modal */}
      <ImportToListsModal
        visible={importToListsModalVisible}
        onClose={() => {
          setImportToListsModalVisible(false);
          setImportTargetItem(null);
        }}
        selectedItem={importTargetItem}
        lists={lists}
        onImport={handleImportToLists}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notificationDetails}
        onMarkAllSeen={markNotificationsSeen}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0a1a',
  },
  searchModeContainer: {
    backgroundColor: '#006666',
  },


  header: {
    backgroundColor: '#2a2a2a',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationButton: {
    padding: 8,
    marginRight: 8,
    position: 'relative',
  },
  notificationIcon: {
    fontSize: 20,
    color: '#fff',
  },
  notificationIconOutline: {
    color: '#999', // Dimmed color for seen notifications
    opacity: 0.7,
  },
  notificationIconActive: {
    color: '#FFD700', // Gold color for new notifications
    textShadowColor: '#FFA500',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  menuButton: {
    padding: 8,
  },
  menuIcon: {
    fontSize: 24,
    color: '#fff',
  },
  listContainer: {
    paddingVertical: 8,
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
    marginBottom: 16,
  },
  errorSubtext: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  newlyDiscoveredSection: {
    backgroundColor: '#2a1a2a',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00d4aa',
    overflow: 'hidden',
  },
  newlyDiscoveredHeader: {
    backgroundColor: '#00d4aa',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  newlyDiscoveredTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a0a1a',
    marginBottom: 4,
  },
  newlyDiscoveredSubtitle: {
    fontSize: 14,
    color: '#1a0a1a',
    opacity: 0.8,
  },
  newlyDiscoveredItems: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});

export default WatchlistScreen; 