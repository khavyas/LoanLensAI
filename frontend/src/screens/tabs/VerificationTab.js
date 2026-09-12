import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, labelize } from '../../theme';
import { Pill, Card, Overline } from '../../components/ui';

const CHECK_TONE = { match: 'success', mismatch: 'danger', warning: 'warning', missing: 'neutral' };
const CHECK_LABEL = { match: 'Match', mismatch: 'Mismatch', warning: 'Review', missing: 'Missing' };
const ACCENT = {
  match: colors.success,
  mismatch: colors.danger,
  warning: colors.warning,
  missing: colors.faint,
};

export default function VerificationTab({ app }) {
  // Only the current document of each type is actionable — a superseded
  // one's checks are history, already resolved by whatever replaced it.
  const docs = (app.documents || []).filter((d) => (d.status || 'current') === 'current');
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
          <Card key={doc._id} style={{ marginBottom: 12 }}>
            <Overline>{labelize(doc.docType || 'document')}</Overline>
            {doc.verification.checks.map((c, i) => (
              <View key={i} style={[styles.check, { borderLeftColor: ACCENT[c.status] }]}>
                <View style={styles.checkHeader}>
                  <Text style={styles.field}>{c.field}</Text>
                  <Pill tone={CHECK_TONE[c.status]}>{CHECK_LABEL[c.status]}</Pill>
                </View>
                <View style={styles.compareRow}>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>Application</Text>
                    <Text style={styles.compareVal}>{c.expected}</Text>
                  </View>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>Document</Text>
                    <Text style={styles.compareVal}>{c.found}</Text>
                  </View>
                </View>
                <Text style={styles.explain}>{c.explanation}</Text>
              </View>
            ))}
          </Card>
        ) : null
      )}

      {app.missingDocuments?.length > 0 && (
        <Card>
          <Overline>Outstanding items</Overline>
          {app.missingDocuments.map((d) => (
            <View key={d} style={styles.missingRow}>
              <View style={styles.missingDot} />
              <Text style={styles.missing}>{labelize(d)} not yet received</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  check: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    marginTop: 14,
  },
  checkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: { fontWeight: '700', color: colors.text, fontSize: 14 },
  compareRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  compareCol: { minWidth: 130, flexShrink: 1 },
  compareLabel: { fontSize: 11, color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.5 },
  compareVal: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2 },
  explain: { color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 18 },
  missingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  missingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, marginRight: 10 },
  missing: { color: colors.text, fontSize: 14 },
});
