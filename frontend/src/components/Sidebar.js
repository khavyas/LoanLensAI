import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from '../navigationRef';

const NAV_ITEMS = [
  { route: 'Applications', label: 'Applications', icon: '⌂', roles: ['officer', 'borrower'] },
  { route: 'NewApplication', label: 'Apply for a Loan', icon: '+', roles: ['borrower'] },
];

// Persistent left nav, shown only on wide viewports (App.js) — real content
// next to real navigation, instead of the app's actual content floating in a
// centered column with the rest of a wide browser window left blank.
//
// This sits outside the Stack.Navigator's subtree (so it doesn't remount on
// every screen change), which means the useNavigation()/useNavigationState()
// hooks aren't available here — they need a nearby Navigator context that a
// sibling of the Navigator doesn't have. Navigating via navigationRef is
// React Navigation's documented way to do this from outside the tree.
export default function Sidebar() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Navigate</Text>
      {NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.item}
          onPress={() => navigationRef.isReady() && navigationRef.navigate(item.route)}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 220,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingTop: 20,
    paddingHorizontal: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  icon: { fontSize: 16, color: colors.muted, width: 18, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted },
});
