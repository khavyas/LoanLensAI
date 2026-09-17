import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, labelize, STATUS_TONE, shadow } from '../theme';
import { Pill, Overline } from '../components/ui';

function initials(name) {
  return (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

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
      <View style={styles.inner}>
        <View style={styles.topBar}>
          <View>
            <Overline>{user.role === 'officer' ? 'Loan Officer Portal' : 'Borrower Portal'}</Overline>
            <Text style={styles.heading}>
              {user.role === 'officer' ? 'Loan Applications' : 'My Applications'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {user.role === 'borrower' && (
              <TouchableOpacity
                style={styles.newBtn}
                onPress={() => navigation.navigate('NewApplication')}
              >
                <Text style={styles.newBtnText}>New application</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Text style={styles.logout}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={apps}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {user.role === 'borrower'
                ? "No applications yet — tap \"New application\" to apply."
                : 'No applications yet.'}
            </Text>
          }
          renderItem={({ item }) => {
            // 'submitted' only means the form was filed — it says nothing
            // about outstanding documents, so show that distinctly instead
            // of a plain "Submitted" that looks finished when it isn't.
            const needsDocs = item.status === 'submitted' && item.missingDocumentsCount > 0;
            const displayLabel = needsDocs
              ? `${item.missingDocumentsCount} Document${item.missingDocumentsCount > 1 ? 's' : ''} Needed`
              : labelize(item.status);
            const displayTone = needsDocs ? 'warning' : STATUS_TONE[item.status] || 'neutral';
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('ApplicationDetail', { id: item._id })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item.applicantName)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{item.applicantName}</Text>
                  <Text style={styles.meta}>
                    {labelize(item.productType)} · ${item.requestedAmount?.toLocaleString('en-US')}
                  </Text>
                </View>
                <Pill tone={displayTone}>{displayLabel}</Pill>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  logout: { color: colors.neutral, fontWeight: '600', fontSize: 13 },
  newBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.accent,
  },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.info, fontWeight: '800', fontSize: 14 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { color: colors.muted, marginTop: 2, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
