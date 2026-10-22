import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, labelize, STATUS_TONE } from '../theme';
import { Pill, Overline } from '../components/ui';
import DocumentsTab from './tabs/DocumentsTab';
import VerificationTab from './tabs/VerificationTab';
import ProgressTab from './tabs/ProgressTab';
import ActionNeededTab from './tabs/ActionNeededTab';
import AssistantTab from './tabs/AssistantTab';
import { APP_TABS, DEFAULT_TAB } from '../navigationRef';

export default function ApplicationDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [app, setApp] = useState(null);
  // The page is part of the URL (/applications/:id/<tab>), so it can be
  // bookmarked, shared and opened directly by the chat assistant.
  const requested = route.params?.tab;
  const tab = APP_TABS.some((t) => t.key === requested) ? requested : DEFAULT_TAB;
  const setTab = (key) => navigation.setParams({ tab: key });

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
          { label: 'Term', value: app.repaymentTermMonths ? `${app.repaymentTermMonths} mo` : '—' },
          { label: 'Stated income', value: `$${app.statedMonthlyIncome?.toLocaleString('en-US')}/mo` },
          { label: 'Employer', value: app.employerName || '—' },
          { label: 'Employer phone', value: app.employerPhone || '—' },
          { label: 'Reason', value: app.loanReason || '—' },
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

        <View style={styles.tabBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
            {APP_TABS.map((t) => {
              const count = t.key === 'action-needed' ? (app.openExceptions || []).length : 0;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                  onPress={() => setTab(t.key)}
                >
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                    {t.label}
                    {count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ flex: 1 }}>
          {tab === 'progress' && <ProgressTab app={app} />}
          {tab === 'documents' && <DocumentsTab app={app} onChanged={load} />}
          {tab === 'verification' && <VerificationTab app={app} />}
          {tab === 'action-needed' && <ActionNeededTab app={app} onChanged={load} />}
          {tab === 'assistant' && <AssistantTab app={app} autoNavigate={false} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  // Fills the content column (sidebar and chat dock are separate columns in
  // App.js). A centered max-width box here made the whole page jump sideways
  // whenever the chat opened or closed, since the column width changed.
  inner: { flex: 1, width: '100%' },
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
  tabBarWrap: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexGrow: 0,
  },
  tabBar: { flexDirection: 'row', paddingHorizontal: 8 },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.accent },
});
