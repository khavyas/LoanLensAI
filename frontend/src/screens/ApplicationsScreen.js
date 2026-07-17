import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const STATUS_COLORS = {
  submitted: colors.accent,
  'needs-review': colors.warning,
  approved: colors.success,
  rejected: colors.danger,
  draft: colors.muted,
};

export default function ApplicationsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [apps, setApps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setApps(await api.applications());
    } catch (e) {
      console.warn(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.welcome}>
          {user.name} · {user.role === 'officer' ? 'Loan Officer' : 'Borrower'}
        </Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={apps}
        keyExtractor={(item) => item._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>No applications yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ApplicationDetail', { id: item._id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.applicantName}</Text>
              <Text style={styles.meta}>
                {item.productType === 'auto-loan' ? 'Auto Loan' : 'Personal Loan'} · $
                {item.requestedAmount?.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] || colors.muted }]}>
              <Text style={styles.badgeText}>{item.status}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 0,
  },
  welcome: { color: colors.text, fontWeight: '600' },
  logout: { color: colors.accent, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { color: colors.muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
