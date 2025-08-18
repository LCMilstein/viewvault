import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Alert,
  TextInput,
} from 'react-native';
import {List} from '../types';

interface ListMenuModalProps {
  visible: boolean;
  onClose: () => void;
  lists: List[];
  activeListId: string;
  selectedListIds: string[];
  onListSelect: (listId: string) => void;
  onListRename: (listId: string, newName: string) => void;
  onListDelete: (listId: string) => void;
  onListReorder: (fromIndex: number, toIndex: number) => void;
  onListShare?: (listId: string) => void;
}

const ListMenuModal: React.FC<ListMenuModalProps> = ({
  visible,
  onClose,
  lists,
  activeListId,
  selectedListIds,
  onListSelect,
  onListRename,
  onListDelete,
  onListReorder,
  onListShare,
}) => {
  const [editingListId, setEditingListId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');

  const handleListPress = (listId: string) => {
    onListSelect(listId);
    onClose();
  };

  const handleRenamePress = (list: List) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const handleRenameSave = () => {
    if (editingListId && editingName.trim()) {
      onListRename(editingListId, editingName.trim());
      setEditingListId(null);
      setEditingName('');
    }
  };

  const handleRenameCancel = () => {
    setEditingListId(null);
    setEditingName('');
  };

  const handleDeletePress = (list: List) => {
    if (list.id === 'personal') {
      Alert.alert('Cannot Delete', 'The personal list cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${list.name}"? This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onListDelete(list.id);
            onClose();
          },
        },
      ],
    );
  };

  const getListIcon = (list: List) => {
    // Use custom icon if available, otherwise default by type
    if (list.icon) {
      return list.icon;
    }
    switch (list.type) {
      case 'personal':
        return '🏠';
      case 'shared':
        return '🤝';
      case 'custom':
        return '📝';
      default:
        return '📋';
    }
  };

  const getListColor = (list: List) => {
    // Use custom color if available, otherwise default by type
    if (list.color) {
      return list.color;
    }
    switch (list.type) {
      case 'personal':
        return '#4CAF50';
      case 'shared':
        return '#2196F3';
      case 'custom':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  };

  const renderListItem = ({item: list, index}: {item: List; index: number}) => {
    const isActive = list.id === activeListId;
    const isSelected = selectedListIds.includes(list.id);
    const isEditing = editingListId === list.id;

    return (
      <View style={styles.listItem}>
        {/* List Icon and Info */}
        <View style={styles.listInfo}>
          <Text style={styles.listIcon}>{getListIcon(list)}</Text>
          <View style={styles.listDetails}>
            {isEditing ? (
              <TextInput
                style={styles.editInput}
                value={editingName}
                onChangeText={setEditingName}
                placeholder="Enter list name"
                placeholderTextColor="#999"
                autoFocus
                onSubmitEditing={handleRenameSave}
              />
            ) : (
              <Text style={[styles.listName, isActive && styles.activeListName]}>
                {list.name}
                {list.type === 'shared' && list.owner_username && (
                  <Text style={styles.ownerText}> (by {list.owner_username})</Text>
                )}
              </Text>
            )}
            <Text style={styles.listDescription}>
              {list.description || `${list.itemCount || 0} items`}
              {list.type === 'shared' && list.permission_level && (
                <Text style={styles.permissionText}> • {list.permission_level}</Text>
              )}
            </Text>
          </View>
        </View>

        {/* Status Indicators */}
        <View style={styles.statusIndicators}>
          {isSelected && <Text style={styles.selectedIndicator}>✓</Text>}
          {isActive && <Text style={styles.activeIndicator}>●</Text>}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleRenameSave}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleRenameCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Only show edit/delete for owned lists */}
              {list.type !== 'shared' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.renameButton]}
                    onPress={() => handleRenamePress(list)}
                  >
                    <Text style={styles.renameButtonText}>✏️</Text>
                  </TouchableOpacity>
                  {list.id !== 'personal' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => handleDeletePress(list)}
                    >
                      <Text style={styles.deleteButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {/* Show share button for owned lists (not shared ones) */}
              {list.type !== 'shared' && onListShare && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.shareButton]}
                  onPress={() => onListShare(list.id)}
                >
                  <Text style={styles.shareButtonText}>🤝</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Manage Lists</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Lists */}
          <FlatList
            data={lists}
            renderItem={renderListItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />

          {/* Footer Info */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {selectedListIds.length > 1 
                ? `${selectedListIds.length} lists selected` 
                : 'Tap a list to select it'
              }
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#999',
    padding: 4,
  },
  listContainer: {
    padding: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  listInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  listDetails: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  activeListName: {
    fontWeight: '600',
    color: '#2196F3',
  },
  listDescription: {
    fontSize: 12,
    color: '#666',
  },
  editInput: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 2,
  },
  statusIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedIndicator: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: 'bold',
    marginRight: 4,
  },
  activeIndicator: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 4,
  },
  renameButton: {
    backgroundColor: '#f0f0f0',
  },
  renameButtonText: {
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  deleteButtonText: {
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  shareButton: {
    backgroundColor: '#e3f2fd',
  },
  shareButtonText: {
    fontSize: 14,
  },
  ownerText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  permissionText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f9f9f9',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

export default ListMenuModal;
