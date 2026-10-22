import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { Card, Overline } from '../../components/ui';
import { computeProgress } from '../../utils/progress';
import { goToApplicationTab } from '../../navigationRef';

// "Where is this application?" — a stepper built from the application's own
// documents and verification results (see utils/progress.js).
export default function ProgressTab({ app }) {
  const p = computeProgress(app);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {app.decisionNotice && (
        <Card style={[{ marginBottom: 12, borderWidth: 1 }, { borderColor: app.decisionNotice.outcome === 'approved' ? colors.success : colors.danger }]}>
          <Overline>Decision</Overline>
          <Text style={styles.noticeTitle}>{app.decisionNotice.message}</Text>
          {app.decisionNotice.reasons ? <Text style={styles.noticeBody}>Reason: {app.decisionNotice.reasons}</Text> : null}
          {app.decisionNotice.conditions?.length ? (
            <Text style={styles.noticeBody}>Conditions: {app.decisionNotice.conditions.join('; ')}</Text>
          ) : null}
          {app.decisionNotice.notice ? <Text style={styles.noticeSmall}>{app.decisionNotice.notice}</Text> : null}
        </Card>
      )}
      <Card>
        <Overline>Overall progress</Overline>
        <View style={styles.pctRow}>
          <Text style={styles.pct}>{p.percent}%</Text>
          <Text style={styles.pctSub}>
            {p.doneCount} of {p.steps.length} steps complete
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${p.percent}%` }]} />
        </View>
        <View style={styles.nextBox}>
          <Text style={styles.nextLabel}>Next step</Text>
          <Text style={styles.nextText}>{p.next}</Text>
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Overline>Application timeline</Overline>
        {p.steps.map((s, i) => {
          const isCurrent = s.key === p.current.key && !s.done;
          const tone = s.done ? colors.success : s.attention ? colors.warning : isCurrent ? colors.accent : colors.faint;
          return (
            <View key={s.key} style={styles.stepRow}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: s.done ? colors.success : '#fff', borderColor: tone }]}>
                  <Text style={[styles.dotText, { color: s.done ? '#fff' : tone }]}>{s.done ? '✓' : i + 1}</Text>
                </View>
                {i < p.steps.length - 1 && (
                  <View style={[styles.line, { backgroundColor: s.done ? colors.success : colors.border }]} />
                )}
              </View>
              <View style={styles.stepBody}>
                <View style={styles.stepTop}>
                  <Text style={[styles.stepTitle, !s.done && !isCurrent && { color: colors.muted }]}>{s.title}</Text>
                  {isCurrent && (
                    <View style={styles.here}>
                      <Text style={styles.hereText}>You are here</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.stepDetail, s.attention && { color: colors.warning, fontWeight: '600' }]}>
                  {s.detail}
                </Text>
                {s.tab && (
                  <TouchableOpacity onPress={() => goToApplicationTab(app._id, s.tab)}>
                    <Text style={styles.link}>View →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  noticeTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 },
  noticeBody: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 19 },
  noticeSmall: { color: colors.muted, fontSize: 11, marginTop: 10, lineHeight: 16 },
  pctRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  pct: { fontSize: 34, fontWeight: '800', color: colors.text },
  pctSub: { color: colors.muted, fontSize: 13 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.neutralBg, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  nextBox: { backgroundColor: colors.infoBg, borderRadius: 8, padding: 12, marginTop: 14 },
  nextLabel: { fontSize: 11, fontWeight: '700', color: colors.info, textTransform: 'uppercase', letterSpacing: 0.5 },
  nextText: { color: colors.text, fontSize: 14, marginTop: 4, lineHeight: 20 },
  stepRow: { flexDirection: 'row', marginTop: 14 },
  rail: { width: 32, alignItems: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 12, fontWeight: '800' },
  line: { width: 2, flex: 1, marginTop: 2, minHeight: 24 },
  stepBody: { flex: 1, paddingLeft: 10, paddingBottom: 6 },
  stepTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  here: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  hereText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  stepDetail: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  link: { color: colors.accent, fontWeight: '600', fontSize: 12, marginTop: 4 },
});
