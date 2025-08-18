import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/api';
import {User} from '../types';

interface AccountScreenProps {
  navigation: any;
  route: any;
  onLogout: () => Promise<void>;
}

const AccountScreen: React.FC<AccountScreenProps> = ({navigation, route, onLogout}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Server configuration state
  const [serverEndpoint, setServerEndpoint] = useState('');
  const [isEditingServer, setIsEditingServer] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadServerSettings();
  }, []);
  
  const loadServerSettings = async () => {
    try {
      const storedEndpoint = await AsyncStorage.getItem('server_endpoint');
      if (storedEndpoint) {
        setServerEndpoint(storedEndpoint);
      } else {
        // Default to current API base
        setServerEndpoint('https://wlapp.umpyours.com/api');
      }
    } catch (error) {
      console.error('Failed to load server settings:', error);
      setServerEndpoint('https://wlapp.umpyours.com/api');
    }
  };

  const loadUserProfile = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getProfile();
      if (response.data) {
        // Map the API response to our User type
        setUser({
          ...response.data,
          is_active: true, // Default to active if not provided
        });
      } else if (response.error) {
        Alert.alert('Error', `Failed to load profile: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      Alert.alert('Error', 'Failed to load user profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminPanel = () => {
    navigation.navigate('AdminPanel');
  };

  const handleRefreshProfile = () => {
    loadUserProfile();
  };

  const handleSaveServerEndpoint = async () => {
    try {
      if (!serverEndpoint.trim()) {
        Alert.alert('Error', 'Please enter a valid server endpoint');
        return;
      }

      // Validate URL format
      let endpoint = serverEndpoint.trim();
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        endpoint = 'https://' + endpoint;
      }
      
      // Remove trailing slash if present
      if (endpoint.endsWith('/')) {
        endpoint = endpoint.slice(0, -1);
      }
      
      // Ensure it ends with /api
      if (!endpoint.endsWith('/api')) {
        endpoint += '/api';
      }

      setIsUpdating(true);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('server_endpoint', endpoint);
      setServerEndpoint(endpoint);
      
      // Update the API service baseUrl
      apiService.updateBaseUrl?.(endpoint);
      
      setIsEditingServer(false);
      Alert.alert('Success', 'Server endpoint updated successfully. You may need to log in again.');
      
    } catch (error) {
      console.error('Failed to save server endpoint:', error);
      Alert.alert('Error', 'Failed to save server endpoint');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetToDefault = () => {
    Alert.alert(
      'Reset to Default',
      'Reset to the default hosted server?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          onPress: () => {
            setServerEndpoint('https://wlapp.umpyours.com/api');
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await onLogout();
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00d4aa" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Account</Text>
          <TouchableOpacity onPress={handleRefreshProfile} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {user && (
          <View style={styles.profileSection}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {user.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.usernameText}>{user.username}</Text>
                <Text style={styles.emailText}>{user.email}</Text>
                {user.is_admin && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.profileStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Account Status</Text>
                <Text style={[styles.statValue, user.is_active ? styles.activeStatus : styles.inactiveStatus]}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>User ID</Text>
                <Text style={styles.statValue}>#{user.id}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Server Configuration Section */}
        <View style={styles.serverSection}>
          <Text style={styles.sectionTitle}>🌐 Server Configuration</Text>
          <Text style={styles.sectionDescription}>
            Configure the ViewVault server endpoint for your self-hosted instance
          </Text>
          
          <View style={styles.serverInputContainer}>
            <Text style={styles.inputLabel}>Server Endpoint</Text>
            {isEditingServer ? (
              <View style={styles.editingContainer}>
                <TextInput
                  style={styles.serverInput}
                  value={serverEndpoint}
                  onChangeText={setServerEndpoint}
                  placeholder="https://your-server.com:8008/api"
                  placeholderTextColor="#666"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.editingButtons}>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.cancelButton]}
                    onPress={() => {
                      setIsEditingServer(false);
                      loadServerSettings(); // Reset to saved value
                    }}>
                    <Text style={styles.smallButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.saveButton]}
                    onPress={handleSaveServerEndpoint}
                    disabled={isUpdating}>
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.smallButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.displayContainer}>
                <Text style={styles.serverDisplayText}>{serverEndpoint}</Text>
                <View style={styles.serverButtons}>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.editButton]}
                    onPress={() => setIsEditingServer(true)}>
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.resetButton]}
                    onPress={handleResetToDefault}>
                    <Text style={styles.smallButtonText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          
          <View style={styles.serverInfo}>
            <Text style={styles.infoText}>
              💡 Default: https://wlapp.umpyours.com/api (hosted service)
            </Text>
            <Text style={styles.infoText}>
              🏠 Self-hosted: https://your-nas-ip:8008/api
            </Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          {user?.is_admin && (
            <TouchableOpacity
              style={[styles.button, styles.adminButton]}
              onPress={handleAdminPanel}
              disabled={isUpdating}>
              <Text style={styles.buttonText}>🛠️ Admin Panel</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.refreshDataButton]}
            onPress={handleRefreshProfile}
            disabled={isUpdating}>
            {isUpdating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Refresh Profile Data</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.logoutButton]}
            onPress={handleLogout}
            disabled={isUpdating}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshButton: {
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  profileSection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#444',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00d4aa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  profileInfo: {
    flex: 1,
  },
  usernameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  emailText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  adminBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  activeStatus: {
    color: '#4CAF50',
  },
  inactiveStatus: {
    color: '#f44336',
  },
  actionSection: {
    gap: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  adminButton: {
    backgroundColor: '#ff9800',
  },
  refreshDataButton: {
    backgroundColor: '#2196F3',
  },
  logoutButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  serverSection: {
    backgroundColor: '#2a2a2a',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    lineHeight: 20,
  },
  serverInputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  editingContainer: {
    gap: 12,
  },
  serverInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#555',
  },
  editingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  displayContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
  },
  serverDisplayText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    marginRight: 12,
  },
  serverButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  resetButton: {
    backgroundColor: '#666',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  serverInfo: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  infoText: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
});

export default AccountScreen; 