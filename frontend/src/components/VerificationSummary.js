import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Pill, Card, Overline } from './ui';

// Shows every parameter the engine checked on an upload — the passes as well
// as the problems — so a reviewer can see exactly what was verified, not just
// what went wrong. (The "Action needed" card still lists only the problems.)

const TONE = { match: 'success', mismatch: 'danger', warning: 'warning' };
const LABEL = { match: 'Match', mismatch: 'Mismatch', warning: 'Review' };
const ICON = { match: '✓', mismatch: '✕', warning: '!' };
const ACCENT = { match: colors.success, mismatch: colors.danger, warning: colors.warning };

const isCrossDocument = (c) => c.field.startsWith('Bank deposit');

export function checkStats(docs) {
  let fields = 0;
  let total = 0;
  let passed = 0;
  let flagged = 0;
  for (const d of docs) {
    fields += Object.values(d.extractedFields || {}).filter((v) => v != null).length;
    for (const c of d.verification?.checks || []) {
      total += 1;
      if (c.status === 'match') passed += 1;
      else flagged += 1;
    }
  }
  return { fields, total, passed, flagged };
}

function Stat({ value, label, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Application-wide totals across every current document.
export function VerificationScoreboard({ docs }) {
  const s = checkStats(docs);
  return (
    <Card style={{ marginTop: 12 }}>
      <Overline>Verification summary</Overline>
      <View style={styles.statRow}>
        <Stat value={docs.length} label="Documents" />
        <Stat value={s.fields} label="Fields extracted" />
        <Stat value={s.total} label="Checks run" />
        <Stat value={s.passed} label="Matched" color={colors.success} />
        <Stat value={s.flagged} label="Flagged" color={s.flagged ? colors.danger : colors.faint} />
      </View>
    </Card>
  );
}

// One document's full checklist: what was extracted, what was compared, and
// the result of each comparison.
export function VerificationChecklist({ doc }) {
  const [open, setOpen] = useState(true);
  const checks = doc.verification?.checks || [];
  const { fields, total, passed, flagged } = checkStats([doc]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.heading}>Verification checks</Text>
        {total > 0 && (
          <TouchableOpacity onPress={() => setOpen((o) => !o)}>
            <Text style={styles.toggle}>{open ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.summaryLine}>
        {fields} fields extracted · {total} {total === 1 ? 'check' : 'checks'} run ·{' '}
        <Text style={{ color: colors.success, fontWeight: '700' }}>{passed} matched</Text> ·{' '}
        <Text style={{ color: flagged ? colors.danger : colors.faint, fontWeight: '700' }}>{flagged} flagged</Text>
      </Text>

      {total === 0 && (
        <Text style={styles.none}>
          No checks could run — none of the extracted fields have an application value to compare against.
        </Text>
      )}

      {open &&
        checks.map((c, i) => (
          <View key={i} style={[styles.row, { borderLeftColor: ACCENT[c.status] }]}>
            <View style={[styles.icon, { backgroundColor: ACCENT[c.status] }]}>
              <Text style={styles.iconText}>{ICON[c.status]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.field}>
                  {c.field}
                  {isCrossDocument(c) ? <Text style={styles.cross}>  · cross-document</Text> : null}
                </Text>
                <Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill>
              </View>
              <Text style={styles.compare}>
                <Text style={styles.cmpLabel}>Expected </Text>
                {c.expected}
                <Text style={styles.cmpLabel}>   Found </Text>
                {c.found}
              </Text>
            </View>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  stat: { flexGrow: 1, minWidth: 90, paddingVertical: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 13, color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  wrap: { marginTop: 14 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 13, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.5 },
  toggle: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  summaryLine: { color: colors.muted, fontSize: 14, marginTop: 4, marginBottom: 4 },
  none: { color: colors.muted, fontSize: 14, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  icon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  iconText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  field: { flexShrink: 1, fontWeight: '700', fontSize: 15, color: colors.text },
  cross: { fontWeight: '600', fontSize: 13, color: colors.info },
  compare: { color: colors.text, fontSize: 14, marginTop: 3, lineHeight: 17 },
  cmpLabel: { color: colors.faint, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
});
