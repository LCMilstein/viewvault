import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import apiService from '../services/api';

interface LoginScreenProps {
  navigation: any;
  route: any;
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({navigation, route, onLoginSuccess}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginForm, setIsLoginForm] = useState(true);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.login(username.trim(), password.trim());
      if (response.data?.access_token) {
        // Success! Call the onLoginSuccess callback to notify the App component
        console.log('Login successful, calling onLoginSuccess...');
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else if (response.error) {
        Alert.alert('Login Failed', response.error);
      }
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.register(username.trim(), email.trim(), password.trim());
      if (response.data?.access_token) {
        // Success! Call the onLoginSuccess callback to notify the App component
        console.log('Registration successful, calling onLoginSuccess...');
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else if (response.error) {
        Alert.alert('Registration Failed', response.error);
      }
    } catch (error) {
      Alert.alert('Registration Failed', error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleForm = () => {
    setIsLoginForm(!isLoginForm);
    setUsername('');
    setPassword('');
    setEmail('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
                        <Text style={styles.title}>ViewVault</Text>
        <Text style={styles.subtitle}>
          {isLoginForm ? 'Sign in to access your watchlist' : 'Create a new account'}
        </Text>
        
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#666"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          {!isLoginForm && (
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          )}
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={isLoginForm ? handleLogin : handleRegister}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>
                {isLoginForm ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.toggleButton} onPress={toggleForm}>
          <Text style={styles.toggleButtonText}>
            {isLoginForm ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  loginButton: {
    backgroundColor: '#00d4aa',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#555',
  },
  loginButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#00d4aa',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen; 