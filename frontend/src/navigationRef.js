import { createNavigationContainerRef } from '@react-navigation/native';

// Sidebar lives outside the Stack.Navigator's own subtree (so it persists
// across screen transitions instead of remounting with each screen) — which
// means useNavigation()/useNavigationState() don't work there; those hooks
// need a nearby Navigator context that a sibling of the Navigator doesn't
// have. This ref is React Navigation's documented way to navigate from
// outside the navigation tree.
export const navigationRef = createNavigationContainerRef();
