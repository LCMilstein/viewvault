import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {List, JellyfinLibrary} from '../types';

interface JellyfinImportModalProps {
  visible: boolean;
  onClose: () => void;
  libraries: JellyfinLibrary[];
  lists: List[];
  onImport: (libraryId: string, targetListIds: string[]) => Promise<void>;
}

const JellyfinImportModal: React.FC<JellyfinImportModalProps> = ({
  visible,
  onClose,
  libraries,
  lists,
  onImport,
}) => {
  const [selectedLibrary, setSelectedLibrary] = useState<JellyfinLibrary | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>(['personal']);
  const [isImporting, setIsImporting] = useState(false);

  // Debug logging
  console.log('🎬 JellyfinImportModal props:', {
    visible,
    librariesCount: libraries?.length || 0,
    libraries: libraries,
    listsCount: lists?.length || 0,
  });

  const handleLibrarySelect = (library: JellyfinLibrary) => {
    setSelectedLibrary(library);
  };

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
    if (!selectedLibrary || selectedListIds.length === 0) return;

    Alert.alert(
      'Confirm Import',
      `Import all items from "${selectedLibrary.name}" to ${selectedListIds.length} list${selectedListIds.length !== 1 ? 's' : ''}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Import',
          onPress: async () => {
            setIsImporting(true);
            try {
              await onImport(selectedLibrary.name, selectedListIds);
              onClose();
              setSelectedLibrary(null);
              setSelectedListIds(['personal']);
            } catch (error) {
              // Error handling is done in parent component
            } finally {
              setIsImporting(false);
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setSelectedLibrary(null);
    setSelectedListIds(['personal']);
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

  const getLibraryIcon = (type: string | undefined) => {
    if (!type) return '📁';
    
    switch (type.toLowerCase()) {
      case 'movies': return '🎬';
      case 'tvshows': return '📺';
      case 'music': return '🎵';
      case 'books': return '📚';
      default: return '📁';
    }
  };

  const renderLibraryItem = ({item: library}: {item: JellyfinLibrary}) => {
    const isSelected = selectedLibrary?.id === library.id;

    return (
      <TouchableOpacity
        style={[styles.libraryItem, isSelected && styles.libraryItemSelected]}
        onPress={() => handleLibrarySelect(library)}>
        <View style={styles.libraryInfo}>
          <Text style={styles.libraryIcon}>{getLibraryIcon(library.type)}</Text>
          <View style={styles.libraryDetails}>
            <Text style={styles.libraryName}>{library.name}</Text>
            <Text style={styles.libraryType}>{library.type}</Text>
          </View>
        </View>
        <View style={styles.checkboxContainer}>
          {isSelected && <Text style={styles.checkbox}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Jellyfin Import</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {!selectedLibrary ? (
          // Step 1: Select Library
          <View style={styles.step}>
            <Text style={styles.stepTitle}>Step 1: Select Jellyfin Library</Text>
            <FlatList
              data={libraries}
              renderItem={renderLibraryItem}
              keyExtractor={(item) => item.id}
              style={styles.libraryList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : (
          // Step 2: Select Lists
          <View style={styles.step}>
            <Text style={styles.stepTitle}>Step 2: Select Target Lists</Text>
            <View style={styles.selectedLibrary}>
              <Text style={styles.selectedLibraryText}>
                Importing from: {getLibraryIcon(selectedLibrary.type)} {selectedLibrary.name}
              </Text>
              <TouchableOpacity
                style={styles.changeLibraryButton}
                onPress={() => setSelectedLibrary(null)}>
                <Text style={styles.changeLibraryText}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionSubtitle}>
              {selectedListIds.length} list{selectedListIds.length !== 1 ? 's' : ''} selected
            </Text>

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
        )}
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
  step: {
    flex: 1,
    padding: 20,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 20,
  },
  libraryList: {
    flex: 1,
  },
  libraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  libraryItemSelected: {
    borderColor: '#00d4aa',
    backgroundColor: '#2a3a2a',
  },
  libraryInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  libraryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  libraryDetails: {
    flex: 1,
  },
  libraryName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  libraryType: {
    fontSize: 12,
    color: '#ccc',
    textTransform: 'capitalize',
  },
  selectedLibrary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#00d4aa',
  },
  selectedLibraryText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  changeLibraryButton: {
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeLibraryText: {
    fontSize: 12,
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 15,
  },
  listContainer: {
    flex: 1,
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
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 20,
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

export default JellyfinImportModal;
