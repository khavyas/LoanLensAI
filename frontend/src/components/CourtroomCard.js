import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

// The two-sided file review (courtroom) as an officer reads it: the case for the applicant beside the
// case for caution. Every point carries references (S = application record, F = this applicant's file,
// P = approved policy); tap one to see the evidence it cites. It is a decision aid and nothing on this
// card recommends an outcome. Side by side when there is room, stacked when not.

const shortName = (c) => (c.kind === 'policy' ? c.doc : c.section || c.doc);

function Chip({ cite, open, onPress }) {
  const policy = cite.kind === 'policy';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, policy && styles.chipPolicy, open && styles.chipOpen]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${cite.label}: ${cite.doc}${cite.section ? ', ' + cite.section : ''}. Show the evidence.`}
    >
      <Text style={[styles.chipText, policy && styles.chipTextPolicy]}>{cite.label} · {shortName(cite)}</Text>
    </TouchableOpacity>
  );
}

function Side({ title, tone, side, emptyText }) {
  const [open, setOpen] = useState(null); // "pointIndex:label"
  const accent = tone === 'for' ? colors.success : colors.danger;
  const tint = tone === 'for' ? colors.successBg : colors.dangerBg;
  return (
    <View style={styles.side}>
      <View style={[styles.sideHead, { backgroundColor: tint, borderLeftColor: accent }]}>
        <Text style={[styles.sideTitle, { color: accent }]}>{title}</Text>
        <View style={[styles.count, { backgroundColor: accent }]}>
          <Text style={styles.countText}>{side.points.length}</Text>
        </View>
      </View>
      {side.points.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        side.points.map((p, i) => {
          const shown = p.cites.find((c) => open === `${i}:${c.label}`);
          return (
            <View key={i} style={styles.point}>
              <Text style={styles.pointText}>{p.text}</Text>
              <View style={styles.chips}>
                {p.cites.map((c) => (
                  <Chip key={c.label} cite={c} open={open === `${i}:${c.label}`} onPress={() => setOpen(open === `${i}:${c.label}` ? null : `${i}:${c.label}`)} />
                ))}
                {p.origin === 'rule' && <Text style={styles.rule}>from the record</Text>}
              </View>
              {shown && (
                <View style={styles.evidence}>
                  <Text style={styles.evidenceHead}>{shown.doc}{shown.section ? ` · ${shown.section}` : ''}</Text>
                  <Text style={styles.evidenceText}>{shown.snippet}</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

export default function CourtroomCard({ review }) {
  const [wide, setWide] = useState(false);
  if (!review) return null;
  return (
    <View onLayout={(e) => setWide(e.nativeEvent.layout.width >= 520)}>
      <View style={styles.titleRow}>
        <Text style={styles.heading}>Two-sided file review</Text>
        <View style={styles.tag}><Text style={styles.tagText}>DECISION AID</Text></View>
      </View>
      <Text style={styles.aid}>{review.decisionAid}</Text>
      {!review.eligible ? (
        <View style={styles.noContest}>
          <Text style={styles.noContestText}>{review.noContest}</Text>
        </View>
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
          <Text style={styles.legend}>Tap a reference to see its evidence. S = application record, F = this applicant's file, P = the bank's approved policy.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  heading: { fontSize: 16, color: colors.text, fontWeight: '700' },
  tag: { backgroundColor: colors.infoBg, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: colors.info, fontSize: 10, letterSpacing: 0.8, fontWeight: '700' },
  aid: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  why: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  noContest: { backgroundColor: colors.neutralBg, borderRadius: 8, padding: 12 },
  noContestText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  degraded: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 8, marginBottom: 10 },
  degradedText: { color: colors.warning, fontSize: 12 },
  columns: { gap: 12 },
  columnsWide: { flexDirection: 'row', alignItems: 'stretch' },
  side: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  sideHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderLeftWidth: 4 },
  sideTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  point: { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border },
  pointText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' },
  chip: { backgroundColor: colors.neutralBg, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3 },
  chipPolicy: { backgroundColor: colors.infoBg, borderColor: colors.infoBg },
  chipOpen: { borderColor: colors.accent },
  chipText: { color: colors.neutral, fontSize: 11 },
  chipTextPolicy: { color: colors.info },
  rule: { color: colors.faint, fontSize: 11, fontStyle: 'italic' },
  evidence: { marginTop: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.accent, borderRadius: 4, padding: 9 },
  evidenceHead: { color: colors.muted, fontSize: 11, marginBottom: 3 },
  evidenceText: { color: colors.text, fontSize: 12, lineHeight: 17 },
  empty: { color: colors.faint, fontSize: 13, padding: 12, fontStyle: 'italic' },
  legend: { color: colors.faint, fontSize: 11, marginTop: 10, lineHeight: 16 },
});
