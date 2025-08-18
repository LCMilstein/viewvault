import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {List} from '../types';

interface ListSelectorProps {
  lists: List[];
  activeListId: string;
  selectedListIds: string[];
  onListSelect: (listId: string) => void;
  onCreateNewList: () => void;
  onListMenuOpen: () => void;
}

const ListSelector: React.FC<ListSelectorProps> = ({
  lists,
  activeListId,
  selectedListIds,
  onListSelect,
  onCreateNewList,
  onListMenuOpen,
}) => {
  const getListIcon = (type: List['type']) => {
    switch (type) {
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

  const getListColor = (type: List['type']) => {
    switch (type) {
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

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {/* List Menu Button */}
        <TouchableOpacity
          style={styles.listMenuButton}
          onPress={onListMenuOpen}
        >
          <Text style={styles.listMenuIcon}>📋</Text>
        </TouchableOpacity>
        {lists.map((list) => (
          <TouchableOpacity
            key={list.id}
            style={[
              styles.chip,
              selectedListIds.includes(list.id) && styles.selectedChip,
              list.id === activeListId && styles.activeChip,
              { borderColor: getListColor(list.type) },
            ]}
            onPress={() => onListSelect(list.id)}
          >
            <Text style={styles.chipIcon}>{getListIcon(list.type)}</Text>
            <Text
              style={[
                styles.chipText,
                selectedListIds.includes(list.id) && styles.selectedChipText,
                list.id === activeListId && styles.activeChipText,
              ]}
            >
              {list.name}
            </Text>
            <Text style={styles.itemCount}>({list.itemCount})</Text>
            {selectedListIds.includes(list.id) && (
              <Text style={styles.selectionIndicator}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
        
        {/* Create New List Button */}
        <TouchableOpacity
          style={[styles.chip, styles.createChip]}
          onPress={onCreateNewList}
        >
          <Text style={styles.createChipIcon}>➕</Text>
          <Text style={styles.createChipText}>New List</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  listMenuButton: {
    padding: 6,
    marginRight: 4,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  listMenuIcon: {
    fontSize: 14,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  activeChip: {
    backgroundColor: '#f0f8ff',
    borderWidth: 3,
  },
  chipIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginRight: 4,
  },
  activeChipText: {
    fontWeight: '600',
  },
  itemCount: {
    fontSize: 12,
    color: '#666',
    fontWeight: '400',
  },
  createChip: {
    borderColor: '#9C27B0',
    borderStyle: 'dashed',
    borderWidth: 2,
  },
  createChipIcon: {
    fontSize: 16,
    marginRight: 6,
    color: '#9C27B0',
  },
  createChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9C27B0',
  },
  selectedChip: {
    backgroundColor: '#e3f2fd',
    borderWidth: 3,
  },
  selectedChipText: {
    fontWeight: '600',
  },
  selectionIndicator: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: 'bold',
    marginLeft: 4,
  },
});

export default ListSelector;
