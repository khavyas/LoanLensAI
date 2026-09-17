import { View, useWindowDimensions } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ApplicationsScreen from './src/screens/ApplicationsScreen';
import ApplicationDetailScreen from './src/screens/ApplicationDetailScreen';
import NewApplicationScreen from './src/screens/NewApplicationScreen';
import BrandHeader from './src/components/BrandHeader';
import Sidebar from './src/components/Sidebar';
import { navigationRef } from './src/navigationRef';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
// Below this viewport width the sidebar hides — matches a phone/small-tablet
// breakpoint so the mobile experience (Expo Go, a narrow browser) is
// untouched; only a real desktop-width browser gets the split layout.
const SIDEBAR_BREAKPOINT = 900;

function Routes() {
  const { user } = useAuth();
  return (
    <Stack.Navigator
      screenOptions={{
        header: (props) => <BrandHeader {...props} />,
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
            options={{ title: user.role === 'officer' ? 'Loan Applications' : 'My Applications' }}
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

function Shell() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const showSidebar = !!user && width >= SIDEBAR_BREAKPOINT;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {showSidebar && <Sidebar />}
      <View style={{ flex: 1 }}>
        <Routes />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <Shell />
      </NavigationContainer>
    </AuthProvider>
  );
}
