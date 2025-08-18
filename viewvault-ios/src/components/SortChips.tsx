import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';

export interface SortOption {
  id: string;
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
}

interface SortChipsProps {
  sorts: SortOption[];
  onSortToggle: (sortId: string) => void;
  isSearchMode?: boolean;
}

const SortChips: React.FC<SortChipsProps> = ({sorts, onSortToggle, isSearchMode = false}) => {
  return (
    <View style={[styles.container, isSearchMode && styles.searchModeContainer]}>
      <Text style={[styles.title, isSearchMode && styles.searchModeTitle]}>Sort Options</Text>
      <View style={styles.chipsContainer}>
        {sorts.map((sort) => (
          <TouchableOpacity
            key={sort.id}
            style={[styles.chip, sort.active && styles.activeChip]}
            onPress={() => onSortToggle(sort.id)}
            activeOpacity={0.7}>
            <Text style={[styles.chipText, sort.active && styles.activeChipText]}>
              {sort.label} {sort.active && (sort.direction === 'asc' ? '↓' : '↑')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a0a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  searchModeContainer: {
    backgroundColor: '#006666',
    borderBottomColor: '#1a0a1a',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00d4aa',
    marginBottom: 8,
  },
  searchModeTitle: {
    color: '#1a0a1a',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#444',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#666',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  activeChip: {
    backgroundColor: '#00d4aa',
    borderColor: '#00d4aa',
  },
  chipText: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: '500',
  },
  activeChipText: {
    color: '#000',
    fontWeight: '600',
  },
});

export default SortChips; 