import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Animated,
} from 'react-native';

interface OmniboxProps {
  onImport: (query: string) => void;
  onSearch: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  onSearchModeChange?: (isSearch: boolean) => void;
  isOffline?: boolean;
}

const Omnibox: React.FC<OmniboxProps> = ({onImport, onSearch, onClearSearch, isSearching, onSearchModeChange, isOffline = false}) => {
  const [isImportMode, setIsImportMode] = useState(!isOffline); // Start in search mode if offline
  const [query, setQuery] = useState('');
  const [scaleAnim] = useState(new Animated.Value(1));

  const handleSubmit = () => {
    if (!query.trim()) return;
    
    if (isImportMode) {
      onImport(query.trim());
    } else {
      onSearch(query.trim());
    }
    setQuery('');
  };

  const handleToggleMode = () => {
    const newMode = !isImportMode;
    setIsImportMode(newMode);
    setQuery('');
    onSearchModeChange?.(!newMode);
    
    // Animate the toggle with bounce
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleClearSearch = () => {
    setQuery('');
    onClearSearch?.();
  };

  return (
    <View style={[styles.container, !isImportMode && styles.searchModeContainer]}>
      <Animated.View style={[styles.toggleContainer, !isImportMode && styles.searchModeToggleContainer, {transform: [{scale: scaleAnim}]}]}>
        {!isOffline && (
          <TouchableOpacity
            style={[styles.toggleButton, isImportMode && styles.activeToggleButton, !isImportMode && styles.searchModeToggleButton]}
            onPress={() => {
              setIsImportMode(true);
              onSearchModeChange?.(false);
            }}
            activeOpacity={0.8}>
            <Text style={[styles.toggleText, isImportMode && styles.activeToggleText, !isImportMode && styles.searchModeToggleText]}>
              Import
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.toggleButton, !isImportMode && styles.activeToggleButton, isImportMode && styles.searchModeToggleButton]}
          onPress={() => {
            setIsImportMode(false);
            onSearchModeChange?.(true);
          }}
          activeOpacity={0.8}>
          <Text style={[styles.toggleText, !isImportMode && styles.activeToggleText, isImportMode && styles.searchModeToggleText]}>
            Search
          </Text>
        </TouchableOpacity>
      </Animated.View>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input, 
            !isImportMode && styles.searchModeInput,
            isOffline && styles.offlineInput
          ]}
          placeholder={isOffline ? 'Offline Search...' : (isImportMode ? 'Enter movie or TV show title to import...' : 'Search your watchlist...')}
          placeholderTextColor={isOffline ? "#fff" : "#666"}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor="#006666"
        />
        {!isImportMode && isSearching && (
          <TouchableOpacity style={[styles.clearButton, styles.searchModeClearButton]} onPress={handleClearSearch}>
            <Text style={[styles.clearText, styles.searchModeClearText]}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[styles.submitButton, !isImportMode && styles.searchModeSubmitButton]} 
          onPress={handleSubmit}
          activeOpacity={0.6}>
          <Text style={[styles.submitText, !isImportMode && styles.searchModeSubmitText]}>
            {isImportMode ? 'Import' : 'Search'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  searchModeContainer: {
    backgroundColor: '#2a2a2a',
    borderBottomColor: '#444',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 2,
  },
  searchModeToggleContainer: {
    backgroundColor: '#1a0a1a',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeToggleButton: {
    backgroundColor: '#006666',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 1.0,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 2,
    borderColor: '#005a5a',
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  searchModeToggleText: {
    color: '#00d4aa',
  },
  activeToggleText: {
    color: '#fff',
    fontWeight: '600',
  },
  searchModeToggleButton: {
    backgroundColor: '#1a0a1a',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  searchModeInput: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderColor: '#444',
    borderRadius: 10,
  },
  offlineInput: {
    backgroundColor: '#ff9800',
    color: '#fff',
    borderColor: '#e68900',
    borderRadius: 10,
  },
  submitButton: {
    backgroundColor: '#006666',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchModeSubmitButton: {
    backgroundColor: '#505050',
  },
  searchModeSubmitText: {
    color: '#fff',
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#444',
    marginLeft: 8,
  },
  searchModeClearButton: {
    backgroundColor: '#1a0a1a',
  },
  clearText: {
    fontSize: 16,
    color: '#fff',
  },
  searchModeClearText: {
    color: '#00d4aa',
  },
});

export default Omnibox; 