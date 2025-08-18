import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';

interface SearchResult {
  title: string;
  imdb_id: string;
  release_date?: string;
  poster_url?: string;
  type: 'movie' | 'series';
}

interface SearchResultsModalProps {
  visible: boolean;
  results: SearchResult[];
  searchQuery: string;
  isLoading: boolean;
  onClose: () => void;
  onImport: (item: SearchResult) => void;
}

const SearchResultsModal: React.FC<SearchResultsModalProps> = ({
  visible,
  results,
  searchQuery,
  isLoading,
  onClose,
  onImport,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 60) / 2; // 2 cards per row with margins
  const cardHeight = 120; // Reduced from ~200 to make cards more compact

  if (isLoading) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Searching...</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Searching for "{searchQuery}"...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {results.length > 0 
              ? `Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${searchQuery}"`
              : `No results for "${searchQuery}"`
            }
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        {results.length === 0 ? (
          <View style={styles.noResultsContainer}>
            <Text style={styles.noResultsText}>
              No movies or TV shows found for "{searchQuery}".
            </Text>
            <Text style={styles.noResultsSubtext}>
              Please try a different search term.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.resultsContainer}>
            {results.map((item, index) => (
              <TouchableOpacity 
                key={`${item.imdb_id}-${index}`} 
                style={[styles.resultCard, { width: cardWidth }]}
                onPress={() => onImport(item)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: item.poster_url || 'https://via.placeholder.com/300x450/333/fff?text=No+Image' }}
                  style={styles.poster}
                  defaultSource={{ uri: 'https://via.placeholder.com/300x450/333/fff?text=No+Image' }}
                />
                <View style={styles.cardContent}>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.type === 'movie' ? 'Movie' : 'TV Series'}
                    {item.release_date && ` • ${new Date(item.release_date).getFullYear()}`}
                  </Text>
                  <Text style={styles.imdbId} numberOfLines={1}>IMDB: {item.imdb_id}</Text>
                  <View style={[styles.importButton, item.type === 'series' ? styles.seriesButton : styles.movieButton]}>
                    <Text style={styles.importButtonText}>
                      Import {item.type === 'movie' ? 'Movie' : 'Series'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0a1a', // Dark purple background to match app theme
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60, // Account for status bar
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noResultsText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  resultsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 16,
  },
  resultCard: {
    backgroundColor: '#2a2a2a', // Dark grey card background
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#444',
  },
  poster: {
    width: '100%',
    height: 80, // Reduced by 20% from 100 to 80
    backgroundColor: '#333',
  },
  cardContent: {
    padding: 6, // Reduced padding from 8 to 6 for more compactness
  },
  title: {
    fontSize: 12, // Reduced font size
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2, // Reduced margin
    lineHeight: 14, // Reduced line height
  },
  meta: {
    fontSize: 10, // Reduced font size
    color: '#ccc',
    marginBottom: 2, // Reduced margin
  },
  imdbId: {
    fontSize: 9, // Reduced font size
    color: '#888',
    marginBottom: 6, // Reduced margin
  },
  importButton: {
    paddingVertical: 4, // Reduced padding
    paddingHorizontal: 8, // Reduced padding
    borderRadius: 6,
    alignItems: 'center',
  },
  movieButton: {
    backgroundColor: '#40c5a8', // Aqua/mint color for movies
  },
  seriesButton: {
    backgroundColor: '#40c5a8', // Same color for consistency
  },
  importButtonText: {
    fontSize: 10, // Reduced font size
    fontWeight: '600',
    color: '#000',
  },
});

export default SearchResultsModal;