import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import {List, SearchResult} from '../types';

interface ImportToListsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedItem: SearchResult | null;
  lists: List[];
  onImport: (targetListIds: string[]) => Promise<void>;
}

const ImportToListsModal: React.FC<ImportToListsModalProps> = ({
  visible,
  onClose,
  selectedItem,
  lists,
  onImport,
}) => {
  const [selectedListIds, setSelectedListIds] = useState<string[]>(['personal']);
  const [isImporting, setIsImporting] = useState(false);

  const handleListToggle = (listId: string) => {
    setSelectedListIds(prev => {
      if (prev.includes(listId)) {
        // Don't allow deselecting all lists
        if (prev.length > 1) {
          return prev.filter(id => id !== listId);
        }
        return prev;
      } else {
        return [...prev, listId];
      }
    });
  };

  const handleImport = async () => {
    if (selectedListIds.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(selectedListIds);
      onClose();
      setSelectedListIds(['personal']); // Reset to default
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedListIds(['personal']); // Reset to default
    onClose();
  };

  const getListIcon = (list: List) => {
    if (list.icon) return list.icon;
    switch (list.type) {
      case 'personal': return '🏠';
      case 'shared': return '🤝';
      case 'custom': return '📝';
      default: return '📋';
    }
  };

  const renderListItem = ({item: list}: {item: List}) => {
    const isSelected = selectedListIds.includes(list.id);
    const isSharedReadOnly = list.type === 'shared' && list.permission_level === 'view';

    return (
      <TouchableOpacity
        style={[
          styles.listItem,
          isSelected && styles.listItemSelected,
          isSharedReadOnly && styles.listItemDisabled,
        ]}
        onPress={() => !isSharedReadOnly && handleListToggle(list.id)}
        disabled={isSharedReadOnly}>
        <View style={styles.listInfo}>
          <Text style={styles.listIcon}>{getListIcon(list)}</Text>
          <View style={styles.listDetails}>
            <Text style={[styles.listName, isSharedReadOnly && styles.listNameDisabled]}>
              {list.name}
              {list.type === 'shared' && list.owner_username && (
                <Text style={styles.ownerText}> (by {list.owner_username})</Text>
              )}
            </Text>
            <Text style={styles.listDescription}>
              {list.description || `${list.itemCount || 0} items`}
              {list.type === 'shared' && list.permission_level && (
                <Text style={styles.permissionText}> • {list.permission_level}</Text>
              )}
            </Text>
          </View>
        </View>
        <View style={styles.checkboxContainer}>
          {isSelected && <Text style={styles.checkbox}>✓</Text>}
          {isSharedReadOnly && <Text style={styles.disabledIcon}>🔒</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  if (!selectedItem) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Import to Lists</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.itemPreview}>
          <Text style={styles.itemTitle}>{selectedItem.title}</Text>
          <Text style={styles.itemType}>
            {selectedItem.type === 'movie' ? '🎬 Movie' : '📺 TV Series'}
          </Text>
          {selectedItem.release_date && (
            <Text style={styles.itemYear}>
              {new Date(selectedItem.release_date).getFullYear()}
            </Text>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Select lists to import to:</Text>
          <Text style={styles.sectionSubtitle}>
            {selectedListIds.length} list{selectedListIds.length !== 1 ? 's' : ''} selected
          </Text>
        </View>

        <FlatList
          data={lists}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.importButton, isImporting && styles.importButtonDisabled]}
            onPress={handleImport}
            disabled={isImporting || selectedListIds.length === 0}>
            {isImporting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.importButtonText}>
                Import to {selectedListIds.length} List{selectedListIds.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  itemPreview: {
    padding: 20,
    backgroundColor: '#2a2a2a',
    margin: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  itemType: {
    fontSize: 14,
    color: '#00d4aa',
    marginBottom: 4,
  },
  itemYear: {
    fontSize: 14,
    color: '#ccc',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#ccc',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  listItemSelected: {
    borderColor: '#00d4aa',
    backgroundColor: '#2a3a2a',
  },
  listItemDisabled: {
    opacity: 0.5,
  },
  listInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  listDetails: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  listNameDisabled: {
    color: '#999',
  },
  listDescription: {
    fontSize: 12,
    color: '#ccc',
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
  checkboxContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    fontSize: 18,
    color: '#00d4aa',
    fontWeight: 'bold',
  },
  disabledIcon: {
    fontSize: 16,
    color: '#999',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  importButton: {
    backgroundColor: '#00d4aa',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  importButtonDisabled: {
    backgroundColor: '#555',
  },
  importButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ImportToListsModal;

