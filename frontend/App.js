import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ApplicationsScreen from './src/screens/ApplicationsScreen';
import ApplicationDetailScreen from './src/screens/ApplicationDetailScreen';
import NewApplicationScreen from './src/screens/NewApplicationScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

function Routes() {
  const { user } = useAuth();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Applications"
            component={ApplicationsScreen}
            options={{ title: 'LoanLens — Applications' }}
          />
          <Stack.Screen
            name="ApplicationDetail"
            component={ApplicationDetailScreen}
            options={{ title: 'Application' }}
          />
          <Stack.Screen
            name="NewApplication"
            component={NewApplicationScreen}
            options={{ title: 'Apply for a Loan' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Routes />
      </NavigationContainer>
    </AuthProvider>
  );
}
