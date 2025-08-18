import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {List} from '../types';

interface ShareListModalProps {
  visible: boolean;
  onClose: () => void;
  list: List | null;
  onShare: (username: string, permissionLevel: 'view' | 'edit') => Promise<void>;
  onUnshare: (username: string) => Promise<void>;
  sharedWith?: {username: string; permission_level: 'view' | 'edit'}[];
}

const ShareListModal: React.FC<ShareListModalProps> = ({
  visible,
  onClose,
  list,
  onShare,
  onUnshare,
  sharedWith = [],
}) => {
  const [username, setUsername] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'view' | 'edit'>('view');
  const [isSharing, setIsSharing] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);

  const handleShare = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    if (sharedWith.some(user => user.username === username.trim())) {
      Alert.alert('Error', 'This list is already shared with this user');
      return;
    }

    setIsSharing(true);
    try {
      await onShare(username.trim(), permissionLevel);
      setUsername('');
      Alert.alert('Success', `List shared with ${username.trim()}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to share list');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async (shareUsername: string) => {
    Alert.alert(
      'Remove Access',
      `Are you sure you want to remove ${shareUsername}'s access to this list?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsUnsharing(true);
            try {
              await onUnshare(shareUsername);
              Alert.alert('Success', `Access removed for ${shareUsername}`);
            } catch (error) {
              Alert.alert('Error', 'Failed to remove access');
            } finally {
              setIsUnsharing(false);
            }
          },
        },
      ]
    );
  };

  const resetModal = () => {
    setUsername('');
    setPermissionLevel('view');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!list) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Share "{list.name}"</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Share with new user */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Share with new user</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Enter username"
              placeholderTextColor="#666"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.permissionContainer}>
              <Text style={styles.permissionLabel}>Permission Level:</Text>
              <View style={styles.permissionButtons}>
                <TouchableOpacity
                  style={[
                    styles.permissionButton,
                    permissionLevel === 'view' && styles.permissionButtonActive,
                  ]}
                  onPress={() => setPermissionLevel('view')}>
                  <Text
                    style={[
                      styles.permissionButtonText,
                      permissionLevel === 'view' && styles.permissionButtonTextActive,
                    ]}>
                    View Only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.permissionButton,
                    permissionLevel === 'edit' && styles.permissionButtonActive,
                  ]}
                  onPress={() => setPermissionLevel('edit')}>
                  <Text
                    style={[
                      styles.permissionButtonText,
                      permissionLevel === 'edit' && styles.permissionButtonTextActive,
                    ]}>
                    Can Edit
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
              onPress={handleShare}
              disabled={isSharing}>
              {isSharing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.shareButtonText}>Share List</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Currently shared with */}
          {sharedWith.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Currently shared with</Text>
              {sharedWith.map((user, index) => (
                <View key={index} style={styles.sharedUserItem}>
                  <View style={styles.sharedUserInfo}>
                    <Text style={styles.sharedUsername}>{user.username}</Text>
                    <Text style={styles.sharedPermission}>
                      {user.permission_level === 'view' ? 'View Only' : 'Can Edit'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unshareButton}
                    onPress={() => handleUnshare(user.username)}
                    disabled={isUnsharing}>
                    <Text style={styles.unshareButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 15,
  },
  permissionContainer: {
    marginBottom: 20,
  },
  permissionLabel: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  permissionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  permissionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  permissionButtonActive: {
    backgroundColor: '#00d4aa',
    borderColor: '#00d4aa',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  permissionButtonTextActive: {
    color: '#000',
  },
  shareButton: {
    backgroundColor: '#00d4aa',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonDisabled: {
    backgroundColor: '#555',
  },
  shareButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sharedUserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  sharedUserInfo: {
    flex: 1,
  },
  sharedUsername: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  sharedPermission: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 2,
  },
  unshareButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unshareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ShareListModal;

