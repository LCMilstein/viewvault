import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../../App';

type MenuNavigationProp = StackNavigationProp<RootStackParamList>;

interface HamburgerMenuProps {
  visible: boolean;
  onClose: () => void;
  onSortToggle: () => void;
  onFilterToggle: () => void;
  onListToggle: () => void;
  onImportFromJellyfin: () => void;
  onAccount: () => void;
  sortActive: boolean;
  filterActive: boolean;
  listActive: boolean;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  visible,
  onClose,
  onSortToggle,
  onFilterToggle,
  onListToggle,
  onImportFromJellyfin,
  onAccount,
  sortActive,
  filterActive,
  listActive,
}) => {
  const navigation = useNavigation<MenuNavigationProp>();
  const slideAnim = useRef(new Animated.Value(250)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 250,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            // Clear authentication and navigate to login
            navigation.reset({
              index: 0,
              routes: [{name: 'Login'}],
            });
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose}>
        <Animated.View 
          style={[
            styles.menuContainer, 
            {transform: [{translateX: slideAnim}]}
          ]}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onSortToggle();
              onClose();
            }}>
            <Text style={styles.menuItemText}>Sort</Text>
            <View style={[styles.dot, sortActive && styles.activeDot]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onFilterToggle();
              onClose();
            }}>
            <Text style={styles.menuItemText}>Filter</Text>
            <View style={[styles.dot, filterActive && styles.activeDot]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onListToggle();
              onClose();
            }}>
            <Text style={styles.menuItemText}>Lists</Text>
            <View style={[styles.dot, listActive && styles.activeDot]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onImportFromJellyfin();
              onClose();
            }}>
            <Text style={styles.menuItemText}>Import from Jellyfin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onAccount();
              onClose();
            }}>
            <Text style={styles.menuItemText}>Account</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <Text style={[styles.menuItemText, styles.signOutText]}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    top: 100,
    right: 0,
    width: 250,
    backgroundColor: '#2a2a2a',
    borderBottomLeftRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: -2, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  menuItemText: {
    fontSize: 16,
    color: '#fff',
  },
  signOutText: {
    color: '#ff6b6b',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
  },
  activeDot: {
    backgroundColor: '#00d4aa',
  },
  divider: {
    height: 1,
    backgroundColor: '#444',
    marginVertical: 8,
  },
});

export default HamburgerMenu; 