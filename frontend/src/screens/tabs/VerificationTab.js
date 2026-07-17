import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../../theme';

const ICON = { match: '✅', mismatch: '❌', warning: '⚠️', missing: '⬜' };
const COLOR = {
  match: colors.success,
  mismatch: colors.danger,
  warning: colors.warning,
  missing: colors.muted,
};

export default function VerificationTab({ app }) {
  const docs = app.documents || [];
  const anyChecks = docs.some((d) => d.verification?.checks?.length);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {!anyChecks && (
        <Text style={styles.empty}>
          No verification results yet — upload a document in the Documents tab.
        </Text>
      )}

      {docs.map((doc) =>
        (doc.verification?.checks || []).length ? (
          <View key={doc._id} style={styles.card}>
            <Text style={styles.docTitle}>{(doc.docType || 'document').replace(/-/g, ' ')}</Text>
            {doc.verification.checks.map((c, i) => (
              <View key={i} style={styles.check}>
                <Text style={styles.icon}>{ICON[c.status]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.field, { color: COLOR[c.status] }]}>{c.field}</Text>
                  <Text style={styles.compare}>
                    Application: {c.expected} · Document: {c.found}
                  </Text>
                  <Text style={styles.explain}>{c.explanation}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null
      )}

      {app.missingDocuments?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.docTitle}>Missing documents</Text>
          {app.missingDocuments.map((d) => (
            <Text key={d} style={styles.missing}>
              ⬜ {d.replace(/-/g, ' ')}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  docTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  check: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border },
  icon: { fontSize: 16 },
  field: { fontWeight: '700' },
  compare: { color: colors.text, fontSize: 13, marginTop: 2 },
  explain: { color: colors.muted, fontSize: 13, marginTop: 2 },
  missing: { color: colors.text, textTransform: 'capitalize', paddingVertical: 2 },
});
