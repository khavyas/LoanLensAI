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
import { ContentWidthContext } from './src/layout';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
// Below this viewport width the sidebar hides — matches a phone/small-tablet
// breakpoint so the mobile experience (Expo Go, a narrow browser) is
// untouched; only a real desktop-width browser gets the split layout.
const SIDEBAR_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 220;
// At or above this width the open chat docks as a full-height right column
// beside the content; below it, the chat floats over the content as before.
const CHAT_DOCK_BREAKPOINT = 1120;
const CHAT_DOCK_WIDTH = 400;

// Shown in the shell's header. Kept here (not in per-screen options) because
// the header lives outside the navigator and can't read screen options.
function routeTitle(name, user) {
  switch (name) {
    case 'Applications':
      return user?.role === 'officer' ? 'Loan Applications' : 'My Applications';
    case 'ApplicationDetail':
      return 'Application';
    case 'NewApplication':
      return 'Apply for a Loan';
    case 'RagAdmin':
      return 'RAG Policy Documents';
    default:
      return '';
  }
}

function Routes() {
  const { user } = useAuth();
  return (
    <Stack.Navigator
      // The header is rendered by Shell, above the whole layout row, so it
      // spans the full window width — see BrandHeader.
      screenOptions={{ headerShown: false }}
    >
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
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
  const [routeName, setRouteName] = useState(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const showSidebar = !!user && width >= SIDEBAR_BREAKPOINT;
  const showChat = !!user && user.role !== 'admin';
  // Wide screens: the open chat is a docked column in the layout row, so it
  // never covers the content — the content column narrows instead.
  const chatDockable = width >= CHAT_DOCK_BREAKPOINT;
  const chatDocked = showChat && chatOpen && chatDockable;
  const contentWidth =
    width - (showSidebar ? SIDEBAR_WIDTH : 0) - (chatDocked ? CHAT_DOCK_WIDTH : 0);

  useEffect(() => {
    const syncRoute = () => {
      const route = navigationRef.getCurrentRoute();
      setRouteName(route?.name ?? null);
      setCanGoBack(navigationRef.isReady() && navigationRef.canGoBack());
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
    // App shell: a full-width header on top, then one row of
    // [sidebar | content | docked chat]. Each region is its own column, so
    // opening the chat narrows the content instead of overlapping it.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {user && <BrandHeader title={routeTitle(routeName, user)} canGoBack={canGoBack} />}
      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        {showSidebar && <Sidebar width={SIDEBAR_WIDTH} activeRoute={routeName} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <ContentWidthContext.Provider value={contentWidth}>
            <Routes />
          </ContentWidthContext.Provider>
        </View>
        {showChat && (
          <FloatingChatWidget
            user={user}
            activeApplicationId={activeApplicationId}
            dockable={chatDockable}
            dockWidth={CHAT_DOCK_WIDTH}
            onOpenChange={setChatOpen}
          />
        )}
      </View>
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
