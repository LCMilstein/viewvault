import React, {useState, useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import WatchlistScreen from './src/screens/WatchlistScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import LoginScreen from './src/screens/LoginScreen';
import apiService from './src/services/api';

export type RootStackParamList = {
  Login: undefined;
  Watchlist: undefined;
  Details: {
    itemId: string;
    itemType: 'movie' | 'series' | 'collection';
  };
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Main App component with authentication flow
 * 
 * This component handles the authentication state and navigation.
 * Users are directed to the login screen if not authenticated,
 * otherwise they see the main watchlist screen.
 */
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated on app start
    checkAuthentication();
  }, []);

  /**
   * Check if user is authenticated
   */
  const checkAuthentication = async () => {
    try {
      const authenticated = apiService.isAuthenticated();
      setIsAuthenticated(authenticated);
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    // Show loading screen while checking authentication
    return null;
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
              component={LoginScreen}
              options={{
                headerShown: false,
              }}
            />
          ) : (
            // Main app screens
            <>
              <Stack.Screen
                name="Watchlist"
                component={WatchlistScreen}
                options={{
                  title: 'My Watchlist',
                }}
              />
              <Stack.Screen
                name="Details"
                component={DetailsScreen}
                options={{
                  title: 'Details',
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App; 