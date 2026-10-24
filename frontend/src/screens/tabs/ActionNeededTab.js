import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, labelize } from '../../theme';
import { Pill, Card, Overline } from '../../components/ui';
import { pickAndUploadDocument } from '../../utils/uploadDocument';

const ISSUE_TONE = { mismatch: 'danger', warning: 'warning' };
const ISSUE_LABEL = { mismatch: 'Mismatch', warning: 'Review' };
const ISSUE_ACCENT = { mismatch: colors.danger, warning: colors.warning };

// Everything still open on this application — a required document never
// uploaded, or an uploaded one with an open flag — on its own page, each with
// the one-tap fix. Same data as the card at the top of the Documents page.
export default function ActionNeededTab({ app, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const exceptions = app.openExceptions || [];

  async function fix(docType) {
    setError(null);
    setBusy(docType);
    try {
      if (await pickAndUploadDocument(app._id, docType)) onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (exceptions.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={styles.clear}>
          <Text style={styles.clearIcon}>✓</Text>
          <Text style={styles.clearTitle}>Nothing needs your action</Text>
          <Text style={styles.clearText}>
            Every required document is uploaded and every check has passed or been resolved.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
        <Overline>Action needed · {exceptions.length}</Overline>
        {exceptions.map((ex, i) => (
          <View key={ex.documentId || ex.docType + i} style={styles.block}>
            <View style={styles.head}>
              <Text style={styles.title}>
                {labelize(ex.docType)}
                {ex.checks?.length > 1 ? ` · ${ex.checks.length} issues` : ''}
              </Text>
              <TouchableOpacity style={styles.fixBtn} onPress={() => fix(ex.docType)} disabled={busy != null}>
                {busy === ex.docType ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fixText}>{ex.type === 'missing' ? 'Upload' : 'Re-upload'}</Text>
                )}
              </TouchableOpacity>
            </View>
            {ex.type === 'missing' ? (
              <Text style={styles.msg}>{ex.message}</Text>
            ) : (
              (ex.checks || []).map((c, j) => (
                <View key={j} style={[styles.issue, { borderLeftColor: ISSUE_ACCENT[c.status] }]}>
                  <View style={styles.issueHead}>
                    <Text style={styles.issueField}>{c.field}</Text>
                    <Pill tone={ISSUE_TONE[c.status]}>{ISSUE_LABEL[c.status]}</Pill>
                  </View>
                  <Text style={styles.msg}>{c.explanation}</Text>
                </View>
              ))
            )}
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  clear: { alignItems: 'center', paddingVertical: 32 },
  clearIcon: { fontSize: 32, color: colors.success, fontWeight: '800' },
  clearTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 8 },
  clearText: { color: colors.muted, fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 360 },
  block: { marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: '700', fontSize: 14, color: colors.text },
  fixBtn: { backgroundColor: colors.warning, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14, minWidth: 88, alignItems: 'center' },
  fixText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  msg: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  issue: { borderLeftWidth: 3, paddingLeft: 10, marginTop: 10 },
  issueHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  issueField: { fontWeight: '700', fontSize: 13, color: colors.text },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
});
