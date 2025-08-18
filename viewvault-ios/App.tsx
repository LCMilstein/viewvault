import React, {useState, useEffect, useRef, useCallback} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import { View } from 'react-native';

import WatchlistScreen from './src/screens/WatchlistScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import LoginScreen from './src/screens/LoginScreen';
import AccountScreen from './src/screens/AccountScreen';
import AdminPanelScreen from './src/screens/AdminPanelScreen';
import apiService from './src/services/api';

export type RootStackParamList = {
  Login: undefined;
  Watchlist: undefined;
  Details: {
    itemId: string;
    itemType: 'movie' | 'series' | 'collection';
  };
  Account: undefined;
  AdminPanel: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Check if user is authenticated
   */
  const checkAuthentication = useCallback(async () => {
    try {
      const authenticated = apiService.isAuthenticated();
      console.log('Authentication check result:', authenticated);
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Authentication check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check authentication on app start
  useEffect(() => {
    checkAuthentication();
  }, [checkAuthentication]);

  const handleLogout = async () => {
    try {
      apiService.clearAccessToken();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLoginSuccess = useCallback(() => {
    console.log('Login success detected, re-checking authentication...');
    checkAuthentication();
  }, [checkAuthentication]);

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: '#1a0a1a' }} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a1a',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          {!isAuthenticated ? (
            // Authentication screens
            <Stack.Screen
              name="Login"
              options={{
                headerShown: false,
              }}
            >
              {props => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          ) : (
            // Main app screens
            <>
              <Stack.Screen
                name="Watchlist"
                component={WatchlistScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Details"
                component={DetailsScreen}
                options={{
                  title: 'Details',
                }}
              />
              <Stack.Screen
                name="Account"
                options={{
                  title: 'Account Settings',
                }}
              >
                {props => <AccountScreen {...props} onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen
                name="AdminPanel"
                component={AdminPanelScreen}
                options={{
                  title: 'Admin Panel',
                  headerStyle: {
                    backgroundColor: '#ff9800',
                  },
                  headerTintColor: '#000',
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App; 