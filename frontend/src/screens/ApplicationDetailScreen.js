import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import DocumentsTab from './tabs/DocumentsTab';
import VerificationTab from './tabs/VerificationTab';
import AssistantTab from './tabs/AssistantTab';

const TABS = ['Documents', 'Verification', 'Assistant'];

export default function ApplicationDetailScreen({ route }) {
  const { id } = route.params;
  const [app, setApp] = useState(null);
  const [tab, setTab] = useState('Documents');

  const load = useCallback(async () => {
    try {
      setApp(await api.application(id));
    } catch (e) {
      console.warn(e.message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!app) return <Text style={styles.loading}>Loading application…</Text>;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.name}>{app.applicantName}</Text>
        <Text style={styles.meta}>
          {app.productType === 'auto-loan' ? 'Auto Loan' : 'Personal Loan'} · Requested $
          {app.requestedAmount?.toLocaleString()} · Stated income ${app.statedMonthlyIncome?.toLocaleString()}/mo
        </Text>
        <Text style={[styles.status, app.status === 'needs-review' && { color: colors.warning }]}>
          Status: {app.status}
        </Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'Documents' && <DocumentsTab app={app} onChanged={load} />}
      {tab === 'Verification' && <VerificationTab app={app} />}
      {tab === 'Assistant' && <AssistantTab app={app} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  loading: { margin: 24, color: colors.muted },
  header: { backgroundColor: colors.card, padding: 16, borderBottomWidth: 1, borderColor: colors.border },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { color: colors.muted, marginTop: 4 },
  status: { marginTop: 6, fontWeight: '700', color: colors.accent, textTransform: 'capitalize' },
  tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border },
  tabBtn: { flex: 1, padding: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
});
