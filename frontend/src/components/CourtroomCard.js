import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

// The two-sided file review (courtroom) as an officer reads it: the case for the applicant beside the
// case for caution, every point carrying the evidence it cites. It is a decision aid; the banner says so
// and nothing on this card recommends an outcome. Side by side when there is room, stacked when not.

const KIND = { file: 'Record / file', policy: 'Approved policy' };

function Side({ title, tone, side, emptyText }) {
  const palette = tone === 'for' ? { head: colors.success, bg: colors.successBg } : { head: colors.danger, bg: colors.dangerBg };
  return (
    <View style={[styles.side, { borderColor: palette.head }]}>
      <View style={[styles.sideHead, { backgroundColor: palette.bg }]}>
        <Text style={[styles.sideTitle, { color: palette.head }]}>{title}</Text>
        <Text style={[styles.sideCount, { color: palette.head }]}>{side.points.length}</Text>
      </View>
      {side.points.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        side.points.map((p, i) => (
          <View key={i} style={styles.point}>
            <Text style={styles.pointText}>{p.text}</Text>
            <View style={styles.chips}>
              {p.cites.map((c) => (
                <View key={c.label} style={[styles.chip, c.kind === 'policy' && styles.chipPolicy]} accessibilityLabel={`${c.label}: ${c.doc}${c.section ? ', ' + c.section : ''}`}>
                  <Text style={[styles.chipText, c.kind === 'policy' && styles.chipTextPolicy]}>{c.label} · {c.kind === 'policy' ? `${c.doc}` : c.section ? `${c.doc} · ${c.section}` : c.doc}</Text>
                </View>
              ))}
              {p.origin === 'rule' && <Text style={styles.rule}>from the record</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export default function CourtroomCard({ review }) {
  const [wide, setWide] = useState(false);
  if (!review) return null;
  return (
    <View onLayout={(e) => setWide(e.nativeEvent.layout.width >= 520)}>
      <Text style={styles.heading}>Two-sided file review</Text>
      <View style={styles.aid}>
        <Text style={styles.aidText}>{review.decisionAid}</Text>
      </View>
      {!review.eligible ? (
        <Text style={styles.noContest}>{review.noContest}</Text>
      ) : (
        <>
          {review.reasons?.length > 0 && <Text style={styles.why}>Opened because: {review.reasons.join('; ')}.</Text>}
          {review.degraded && (
            <View style={styles.degraded}>
              <Text style={styles.degradedText}>{review.degradedNote}</Text>
            </View>
          )}
          <View style={[styles.columns, wide && styles.columnsWide]}>
            <Side title="For the applicant" tone="for" side={review.for} emptyText="No supported argument on this side." />
            <Side title="For caution" tone="against" side={review.against} emptyText="Nothing flagged on this side." />
          </View>
          <Text style={styles.legend}>S = the application record, F = this applicant's file, P = the bank's approved policy. Every point must cite one; figures must appear in what it cites.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 },
  aid: { backgroundColor: colors.infoBg, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 8 },
  aidText: { color: colors.info, fontSize: 12, fontWeight: '700' },
  why: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  noContest: { color: colors.text, fontSize: 14, lineHeight: 20 },
  degraded: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 8, marginBottom: 8 },
  degradedText: { color: colors.warning, fontSize: 12 },
  columns: { gap: 10 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  side: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  sideHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10 },
  sideTitle: { fontSize: 13, fontWeight: '800' },
  sideCount: { fontSize: 13, fontWeight: '800' },
  point: { paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border },
  pointText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6, alignItems: 'center' },
  chip: { backgroundColor: colors.neutralBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipPolicy: { backgroundColor: colors.infoBg },
  chipText: { color: colors.neutral, fontSize: 11, fontWeight: '700' },
  chipTextPolicy: { color: colors.info },
  rule: { color: colors.faint, fontSize: 11, fontStyle: 'italic' },
  empty: { color: colors.faint, fontSize: 13, padding: 10, fontStyle: 'italic' },
  legend: { color: colors.faint, fontSize: 11, marginTop: 8, lineHeight: 16 },
});
