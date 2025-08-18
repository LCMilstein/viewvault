import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

interface LibrarySelectionModalProps {
  visible: boolean;
  libraries: string[];
  onSelectLibrary: (libraryName: string) => void;
  onCancel: () => void;
}

const LibrarySelectionModal: React.FC<LibrarySelectionModalProps> = ({
  visible,
  libraries,
  onSelectLibrary,
  onCancel,
}) => {
  const handleLibrarySelect = (libraryName: string) => {
    Alert.alert(
      'Confirm Import',
      `Import all movies from "${libraryName}" library? This will add new movies and update quality information for existing ones.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Import',
          onPress: () => onSelectLibrary(libraryName),
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Select Jellyfin Library</Text>
          <Text style={styles.subtitle}>Choose which library to import from:</Text>
          
          <ScrollView style={styles.libraryList} showsVerticalScrollIndicator={false}>
            {libraries.map((libraryName, index) => (
              <TouchableOpacity
                key={index}
                style={styles.libraryOption}
                onPress={() => handleLibrarySelect(libraryName)}
                activeOpacity={0.7}
              >
                <Text style={styles.libraryText}>{libraryName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  libraryList: {
    maxHeight: 300,
  },
  libraryOption: {
    backgroundColor: '#404040',
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#555',
  },
  libraryText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#666',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  cancelText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default LibrarySelectionModal; 