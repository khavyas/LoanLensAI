import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

// Sidebar lives outside the Stack.Navigator's own subtree (so it doesn't
// remount with each screen) — which means useNavigation()/useNavigationState()
// don't work there; those hooks need a nearby Navigator context that a
// sibling of the Navigator doesn't have. This ref is React Navigation's
// documented way to navigate from outside the navigation tree.
export const navigationRef = createNavigationContainerRef();

// The pages inside an application. `key` is the URL segment:
// /applications/:id/<key>
export const APP_TABS = [
  { key: 'progress', label: 'Progress' },
  { key: 'documents', label: 'Documents' },
  { key: 'verification', label: 'Verification' },
  { key: 'action-needed', label: 'Action Needed' },
  { key: 'assistant', label: 'Assistant' },
];
export const DEFAULT_TAB = 'documents';

// Opens one page of an application. If that application is already on screen
// only the tab changes (the URL updates, nothing remounts or re-fetches).
export function goToApplicationTab(id, tab) {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute();
  if (route?.name === 'ApplicationDetail' && route.params?.id === id) {
    navigationRef.dispatch(CommonActions.setParams({ tab }));
  } else {
    navigationRef.navigate('ApplicationDetail', { id, tab });
  }
}
