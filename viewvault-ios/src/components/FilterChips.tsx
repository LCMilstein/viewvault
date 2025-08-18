import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';

export interface FilterOption {
  id: string;
  label: string;
  active: boolean;
}

interface FilterChipsProps {
  filters: FilterOption[];
  onFilterToggle: (filterId: string) => void;
  isSearchMode?: boolean;
}

const FilterChips: React.FC<FilterChipsProps> = ({filters, onFilterToggle, isSearchMode = false}) => {
  return (
    <View style={[styles.container, isSearchMode && styles.searchModeContainer]}>
      <Text style={[styles.title, isSearchMode && styles.searchModeTitle]}>Filter Options</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.chip, filter.active && styles.activeChip]}
            onPress={() => onFilterToggle(filter.id)}
            activeOpacity={0.7}>
            <Text style={[styles.chipText, filter.active && styles.activeChipText]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingHorizontal: 8,
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

export default FilterChips; 