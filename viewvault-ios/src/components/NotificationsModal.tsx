import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
} from 'react-native';
import {NotificationDetail} from '../types';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: NotificationDetail[];
  onMarkAllSeen: () => void;
}

const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
  notifications,
  onMarkAllSeen,
}) => {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_sequel': return '🎬';
      case 'new_episode': return '📺';
      default: return '🆕';
    }
  };

  const getNotificationTypeText = (type: string) => {
    switch (type) {
      case 'new_sequel': return 'New Sequel';
      case 'new_episode': return 'New Episode';
      default: return 'New Content';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Recently';
    }
  };

  const renderNotificationItem = ({item}: {item: NotificationDetail}) => (
    <View style={styles.notificationItem}>
      <View style={styles.notificationHeader}>
        <Text style={styles.notificationIcon}>{getNotificationIcon(item.type)}</Text>
        <View style={styles.notificationInfo}>
          <Text style={styles.notificationTitle}>{item.title}</Text>
          <Text style={styles.notificationType}>{getNotificationTypeText(item.type)}</Text>
        </View>
        <Text style={styles.notificationDate}>{formatDate(item.created_at)}</Text>
      </View>
      {item.description && (
        <Text style={styles.notificationDescription}>{item.description}</Text>
      )}
    </View>
  );

  const handleMarkAllSeen = () => {
    onMarkAllSeen();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No New Notifications</Text>
            <Text style={styles.emptySubtitle}>
              We'll notify you when there are new releases for your watchlist items.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.headerActions}>
              <Text style={styles.notificationCount}>
                {notifications.length} new notification{notifications.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={handleMarkAllSeen}>
                <Text style={styles.markAllButtonText}>Mark All as Seen</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={notifications}
              renderItem={renderNotificationItem}
              keyExtractor={(item) => item.id}
              style={styles.notificationsList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.notificationsContent}
            />
          </>
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
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  notificationCount: {
    fontSize: 14,
    color: '#ccc',
  },
  markAllButton: {
    backgroundColor: '#00d4aa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  markAllButtonText: {
    fontSize: 12,
    color: '#000',
    fontWeight: '500',
  },
  notificationsList: {
    flex: 1,
  },
  notificationsContent: {
    padding: 20,
  },
  notificationItem: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  notificationType: {
    fontSize: 12,
    color: '#00d4aa',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  notificationDate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  notificationDescription: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    marginLeft: 32,
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default NotificationsModal;

