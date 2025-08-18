import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  FlatList,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import apiService from '../services/api';
import {AdminUser, AdminDashboard} from '../types';

interface AdminPanelScreenProps {
  navigation: any;
}

const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({navigation}) => {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users'>('dashboard');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setIsLoading(true);
      
      // Load dashboard data
      const dashboardResponse = await apiService.getAdminDashboard();
      if (dashboardResponse.data) {
        setDashboard(dashboardResponse.data);
      } else if (dashboardResponse.error) {
        console.error('Dashboard error:', dashboardResponse.error);
        Alert.alert('Dashboard Error', dashboardResponse.error);
        return;
      }
      
      // Load users data
      const usersResponse = await apiService.getUsers();
      if (usersResponse.data) {
        setUsers(usersResponse.data);
      } else if (usersResponse.error) {
        console.error('Users error:', usersResponse.error);
        Alert.alert('Users Error', usersResponse.error);
        return;
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
      Alert.alert('Error', `Failed to load admin data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelect = async (userId: number) => {
    try {
      setIsUpdating(true);
      const response = await apiService.getUser(userId.toString());
      if (response.data) {
        setSelectedUser(response.data);
      }
    } catch (error) {
      console.error('Failed to load user details:', error);
      Alert.alert('Error', 'Failed to load user details');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleUserAdmin = async (userId: number, isAdmin: boolean) => {
    try {
      setIsUpdating(true);
      const response = await apiService.updateUser(userId.toString(), {
        is_admin: !isAdmin,
      });
      
      if (response.data) {
        // Update local state
        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, is_admin: !isAdmin } : user
        ));
        
        if (selectedUser && selectedUser.id === userId) {
          setSelectedUser({ ...selectedUser, is_admin: !isAdmin });
        }
        
        Alert.alert('Success', `User ${!isAdmin ? 'promoted to' : 'removed from'} admin`);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      Alert.alert('Error', 'Failed to update user');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearUserData = async (userId: number, username: string) => {
    Alert.alert(
      'Clear User Data',
      `Are you sure you want to clear all data for ${username}? This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdating(true);
              await apiService.clearUserData(userId.toString());
              Alert.alert('Success', 'User data cleared successfully');
              loadAdminData(); // Refresh data
            } catch (error) {
              console.error('Failed to clear user data:', error);
              Alert.alert('Error', 'Failed to clear user data');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${username}? This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdating(true);
              await apiService.deleteUser(userId.toString());
              
              // Remove from local state
              setUsers(prev => prev.filter(user => user.id !== userId));
              if (selectedUser && selectedUser.id === userId) {
                setSelectedUser(null);
              }
              
              Alert.alert('Success', 'User deleted successfully');
            } catch (error) {
              console.error('Failed to delete user:', error);
              Alert.alert('Error', 'Failed to delete user');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const renderUserItem = ({item: user}: {item: AdminUser}) => (
    <TouchableOpacity
      style={[styles.userItem, selectedUser?.id === user.id && styles.userItemSelected]}
      onPress={() => handleUserSelect(user.id)}>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={styles.username}>{user.username}</Text>
          <View style={styles.userBadges}>
            {user.is_admin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
            <View style={[styles.statusBadge, user.is_active ? styles.activeBadge : styles.inactiveBadge]}>
              <Text style={styles.statusBadgeText}>
                {user.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.userEmail}>{user.email}</Text>
        <Text style={styles.userStats}>
          ID: {user.id} • {user.watchlist_count || 0} items
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff9800" />
          <Text style={styles.loadingText}>Loading admin panel...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛠️ Admin Panel</Text>
        <TouchableOpacity onPress={loadAdminData} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'dashboard' && styles.activeTab]}
          onPress={() => setActiveTab('dashboard')}>
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>
            Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.activeTab]}
          onPress={() => setActiveTab('users')}>
          <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>
            Users ({users.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'dashboard' && dashboard && (
        <ScrollView style={styles.content}>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboard.total_users}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboard.active_users}</Text>
              <Text style={styles.statLabel}>Active Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboard.total_movies}</Text>
              <Text style={styles.statLabel}>Total Movies</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboard.total_series}</Text>
              <Text style={styles.statLabel}>Total Series</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboard.total_lists}</Text>
              <Text style={styles.statLabel}>Total Lists</Text>
            </View>
          </View>

          {dashboard.recent_registrations && dashboard.recent_registrations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Registrations</Text>
              {dashboard.recent_registrations.map(user => (
                <View key={user.id} style={styles.recentUserItem}>
                  <Text style={styles.recentUserName}>{user.username}</Text>
                  <Text style={styles.recentUserDate}>{user.created_at}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === 'users' && (
        <View style={styles.content}>
          <View style={styles.userControls}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search users..."
              placeholderTextColor="#666"
              value={userSearchQuery}
              onChangeText={setUserSearchQuery}
            />
          </View>

          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id.toString()}
            style={styles.usersList}
          />

          {selectedUser && (
            <View style={styles.userActions}>
              <Text style={styles.userActionsTitle}>Actions for {selectedUser.username}</Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.toggleAdminButton]}
                  onPress={() => handleToggleUserAdmin(selectedUser.id, selectedUser.is_admin)}
                  disabled={isUpdating}>
                  <Text style={styles.actionButtonText}>
                    {selectedUser.is_admin ? 'Remove Admin' : 'Make Admin'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.clearDataButton]}
                  onPress={() => handleClearUserData(selectedUser.id, selectedUser.username)}
                  disabled={isUpdating}>
                  <Text style={styles.actionButtonText}>Clear Data</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteUserButton]}
                  onPress={() => handleDeleteUser(selectedUser.id, selectedUser.username)}
                  disabled={isUpdating}>
                  <Text style={styles.actionButtonText}>Delete User</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#ff9800',
  },
  tabText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#000',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff9800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#ccc',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  recentUserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  recentUserName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  recentUserDate: {
    color: '#ccc',
    fontSize: 12,
  },
  userControls: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
  },
  usersList: {
    flex: 1,
  },
  userItem: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  userItemSelected: {
    borderColor: '#ff9800',
    backgroundColor: '#3a2a1a',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  userBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  adminBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
  },
  inactiveBadge: {
    backgroundColor: '#f44336',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  userEmail: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  userStats: {
    fontSize: 12,
    color: '#999',
  },
  userActions: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  userActionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleAdminButton: {
    backgroundColor: '#2196F3',
  },
  clearDataButton: {
    backgroundColor: '#ff9800',
  },
  deleteUserButton: {
    backgroundColor: '#f44336',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default AdminPanelScreen;

