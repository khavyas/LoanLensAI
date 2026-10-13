import { useEffect, useState } from 'react';
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
import RagAdminScreen from './src/screens/RagAdminScreen';
import FloatingChatWidget from './src/components/FloatingChatWidget';
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
      ) : user.role === 'admin' ? (
        <Stack.Screen
          name="RagAdmin"
          component={RagAdminScreen}
          options={{ title: 'RAG Policy Documents' }}
        />
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
  const [activeApplicationId, setActiveApplicationId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const showSidebar = !!user && width >= SIDEBAR_BREAKPOINT;
  // On wide screens, reserve the chat panel's footprint in the app layout so
  // it cannot cover form controls. Smaller screens keep the chat as an overlay.
  const reserveChatSpace = chatOpen && width >= 1120;

  useEffect(() => {
    const syncRoute = () => {
      const route = navigationRef.getCurrentRoute();
      setActiveApplicationId(route?.name === 'ApplicationDetail' ? route.params?.id : null);
    };
    syncRoute();
    const unsubscribe = navigationRef.addListener('state', syncRoute);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || user.role === 'admin') setChatOpen(false);
  }, [user]);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {showSidebar && <Sidebar />}
      <View style={{ flex: 1, marginRight: reserveChatSpace ? 440 : 0 }}>
        <Routes />
      </View>
      {user && user.role !== 'admin' && (
        <FloatingChatWidget
          user={user}
          activeApplicationId={activeApplicationId}
          onOpenChange={setChatOpen}
        />
      )}
    </View>
  );
}

// Default behavior just uses the focused screen's own title ("Application",
// "Apply for a Loan", ...) as the raw browser tab title — this is exactly
// why the tab showed bare "Application" with no branding.
const documentTitle = {
  formatter: (options, route) => {
    const screenTitle = options?.title ?? route?.name;
    return screenTitle ? `LoanLens AI · ${screenTitle}` : 'LoanLens AI';
  },
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef} documentTitle={documentTitle}>
        <StatusBar style="light" />
        <Shell />
      </NavigationContainer>
    </AuthProvider>
  );
}
