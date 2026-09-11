import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, labelize, STATUS_TONE } from '../theme';
import { Pill, Overline } from '../components/ui';
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

  const facts =
    app.productType === 'small-business-loan'
      ? [
          { label: 'Product', value: labelize(app.productType) },
          { label: 'Requested', value: `$${app.requestedAmount?.toLocaleString('en-US')}` },
          { label: 'Business', value: app.businessName || '—' },
          {
            label: 'Stated annual revenue',
            value: app.statedAnnualBusinessRevenue
              ? `$${app.statedAnnualBusinessRevenue.toLocaleString('en-US')}/yr`
              : '—',
          },
        ]
      : [
          { label: 'Product', value: labelize(app.productType) },
          { label: 'Requested', value: `$${app.requestedAmount?.toLocaleString('en-US')}` },
          { label: 'Stated income', value: `$${app.statedMonthlyIncome?.toLocaleString('en-US')}/mo` },
          { label: 'Employer', value: app.employerName || '—' },
        ];

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Overline>Application</Overline>
              <Text style={styles.name}>{app.applicantName}</Text>
            </View>
            <Pill tone={STATUS_TONE[app.status] || 'neutral'}>{labelize(app.status)}</Pill>
          </View>
          <View style={styles.factsRow}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={styles.factValue}>{f.value}</Text>
              </View>
            ))}
          </View>
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

        <View style={{ flex: 1 }}>
          {tab === 'Documents' && <DocumentsTab app={app} onChanged={load} />}
          {tab === 'Verification' && <VerificationTab app={app} />}
          {tab === 'Assistant' && <AssistantTab app={app} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  loading: { margin: 24, color: colors.muted },
  header: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  factsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 24 },
  fact: { minWidth: 120 },
  factLabel: { fontSize: 12, color: colors.faint, marginBottom: 2 },
  factValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
  },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.accent },
});
