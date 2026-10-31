import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, labelize, statusLabel, STATUS_TONE } from '../theme';
import { useAuth } from '../context/AuthContext';
import { Pill, Overline } from '../components/ui';
import DocumentsTab from './tabs/DocumentsTab';
import VerificationTab from './tabs/VerificationTab';
import ProgressTab from './tabs/ProgressTab';
import ActionNeededTab from './tabs/ActionNeededTab';
import AssistantTab from './tabs/AssistantTab';
import DecisionTab from './tabs/DecisionTab';
import EditApplicationPanel from '../components/EditApplicationPanel';
import { formatChange } from '../utils/formatChange';
import { DEFAULT_TAB, tabsForRole } from '../navigationRef';

const RESIDENCY_LABEL = { 'us-citizen': 'U.S. citizen', 'permanent-resident': 'Permanent resident', 'visa-holder': 'Visa holder' };

function residencyFact(app) {
  const label = RESIDENCY_LABEL[app.residencyStatus] || '—';
  return app.residencyStatus === 'visa-holder' && app.visaValidUntil
    ? `${label} (until ${new Date(app.visaValidUntil).toISOString().slice(0, 10)})`
    : label;
}

export default function ApplicationDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const tabs = tabsForRole(user.role);
  const [app, setApp] = useState(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null); // what the last edit changed
  // The page is part of the URL (/applications/:id/<tab>), so it can be
  // bookmarked, shared and opened directly by the chat assistant.
  const requested = route.params?.tab;
  const tab = tabs.some((t) => t.key === requested) ? requested : DEFAULT_TAB;
  const setTab = (key) => {
    setEditing(false);
    navigation.setParams({ tab: key });
  };

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
          { label: 'Residency', value: residencyFact(app) },
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
            <View style={{ alignItems: 'flex-end', gap: 10 }}>
              <Pill tone={STATUS_TONE[app.status] || 'neutral'}>{statusLabel(app.status)}</Pill>
              {user.role === 'borrower' && app.edit?.allowed && !editing && (
                <TouchableOpacity style={styles.editBtn} onPress={() => { setNotice(null); setEditing(true); }}>
                  <Text style={styles.editBtnText}>Edit application</Text>
                </TouchableOpacity>
              )}
            </View>
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

        {notice && (
          <View style={styles.notice}>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Application updated. We re-checked your documents.</Text>
              {notice.changes.map((c) => (
                <Text key={c.field} style={styles.noticeLine}>{formatChange(c)}</Text>
              ))}
            </View>
            <TouchableOpacity onPress={() => setNotice(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.noticeClose}>{'\u00D7'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
            {tabs.map((t) => {
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
          {editing && (
            <EditApplicationPanel
              app={app}
              onCancel={() => setEditing(false)}
              onSaved={(result) => {
                setEditing(false);
                setNotice(result);
                load();
              }}
            />
          )}
          {!editing && tab === 'progress' && <ProgressTab app={app} />}
          {!editing && tab === 'documents' && <DocumentsTab app={app} onChanged={load} />}
          {!editing && tab === 'verification' && <VerificationTab app={app} />}
          {!editing && tab === 'action-needed' && <ActionNeededTab app={app} onChanged={load} />}
          {!editing && tab === 'assistant' && <AssistantTab app={app} autoNavigate={false} />}
          {!editing && tab === 'decision' && <DecisionTab app={app} onChanged={load} />}
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
  editBtn: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: colors.card },
  editBtnText: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.successBg, borderBottomWidth: 1, borderColor: colors.success, paddingVertical: 12, paddingHorizontal: 20 },
  noticeTitle: { color: colors.success, fontWeight: '800', fontSize: 16 },
  noticeLine: { color: colors.text, fontSize: 15, marginTop: 4 },
  noticeClose: { color: colors.muted, fontSize: 28, lineHeight: 28 },
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
