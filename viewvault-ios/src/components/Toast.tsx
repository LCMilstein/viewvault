import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onHide: () => void;
}

const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'info',
  duration = 3000,
  onHide,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      // Show toast
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after duration
      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible) return null;

  const getToastStyle = () => {
    switch (type) {
      case 'success':
        return styles.successToast;
      case 'error':
        return styles.errorToast;
      case 'info':
      default:
        return styles.infoToast;
    }
  };

  const getTextStyle = () => {
    switch (type) {
      case 'success':
        return styles.successText;
      case 'error':
        return styles.errorText;
      case 'info':
      default:
        return styles.infoText;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getToastStyle(),
        {
          opacity: fadeAnim,
          transform: [{translateY: slideAnim}],
        },
      ]}>
      <Text style={[styles.message, getTextStyle()]}>{message}</Text>
      <TouchableOpacity onPress={hideToast} style={styles.closeButton}>
        <Text style={[styles.closeText, getTextStyle()]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  successToast: {
    backgroundColor: '#4CAF50',
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
  },
  errorToast: {
    backgroundColor: '#F44336',
    borderLeftWidth: 4,
    borderLeftColor: '#C62828',
  },
  infoToast: {
    backgroundColor: '#2196F3',
    borderLeftWidth: 4,
    borderLeftColor: '#1565C0',
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  successText: {
    color: '#fff',
  },
  errorText: {
    color: '#fff',
  },
  infoText: {
    color: '#fff',
  },
  closeButton: {
    marginLeft: 12,
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default Toast; 