import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme';

// The courtroom: the two sides of a file argued as a hearing the officer presides over. The risk reviewer
// opens, the advocate answers, and they alternate, each point with its evidence one tap away (S = application
// record, F = this applicant's file, P = approved policy, X = a scripted demo exhibit). The officer is the
// judge: Sustain a point that persuades you, Overrule one that does not, or cross-examine a point to hear
// the other side answer it. The scale shows the officer's own weighing and nothing else. It is a decision
// aid: nothing on this card recommends an outcome, and nothing the officer taps here is saved or sent.

const TYPING_MS = 750;
const SIDE = {
  against: { name: 'Risk reviewer', role: 'for caution', accent: colors.danger, tint: colors.dangerBg, glyph: '!' },
  for: { name: 'Advocate', role: 'for the applicant', accent: colors.success, tint: colors.successBg, glyph: '✓' },
};
const shortName = (c) => (c.kind === 'policy' ? c.doc : c.section || c.doc);

function Cites({ cites }) {
  const [open, setOpen] = useState(null);
  const shown = cites.find((c) => c.label === open);
  return (
    <View>
      <View style={styles.chips}>
        {cites.map((c) => (
          <TouchableOpacity
            key={c.label}
            onPress={() => setOpen(open === c.label ? null : c.label)}
            style={[styles.chip, c.kind === 'policy' && styles.chipPolicy, c.kind === 'exhibit' && styles.chipExhibit, open === c.label && styles.chipOpen]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === c.label }}
            accessibilityLabel={`${c.label}: ${c.doc}${c.section ? ', ' + c.section : ''}. Show the evidence.`}
          >
            <Text style={[styles.chipText, c.kind === 'policy' && styles.chipTextPolicy, c.kind === 'exhibit' && styles.chipTextExhibit]}>
              {c.kind === 'exhibit' ? '◆ ' : ''}{c.label} · {shortName(c)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {shown && (
        <View style={styles.evidence}>
          <Text style={styles.evidenceHead}>{shown.doc}{shown.section ? ` · ${shown.section}` : ''}</Text>
          <Text style={styles.evidenceText}>{shown.snippet}</Text>
        </View>
      )}
    </View>
  );
}

// Fades and slides in when it appears.
function Enter({ children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: false }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function Typing({ side }) {
  const s = SIDE[side];
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.25))).current;
  useEffect(() => {
    const loops = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: false }),
      Animated.timing(d, { toValue: 0.25, duration: 260, useNativeDriver: false }),
      Animated.delay((2 - i) * 160),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={[styles.typing, side === 'against' ? styles.right : styles.left]} accessibilityLiveRegion="polite" accessibilityLabel={`${s.name} is speaking`}>
      <Text style={[styles.typingName, { color: s.accent }]}>{s.name} is on their feet</Text>
      <View style={styles.dots}>
        {dots.map((d, i) => <Animated.View key={i} style={[styles.dot, { backgroundColor: s.accent, opacity: d }]} />)}
      </View>
    </View>
  );
}

function Turn({ turn, mark, onMark }) {
  const [crossed, setCrossed] = useState(false);
  const s = SIDE[turn.side];
  const r = turn.reply ? SIDE[turn.reply.side] : null;
  return (
    <Enter style={[styles.turn, turn.side === 'against' ? styles.right : styles.left]}>
      <View style={[styles.bubble, { borderColor: s.accent, backgroundColor: s.tint }, mark === 'overrule' && styles.discounted]}>
        <View style={styles.speaker}>
          <View style={[styles.glyph, { backgroundColor: s.accent }]}><Text style={styles.glyphText}>{s.glyph}</Text></View>
          <Text style={[styles.speakerName, { color: s.accent }]}>{s.name.toUpperCase()}</Text>
          <Text style={styles.speakerRole}>{s.role}</Text>
        </View>
        <Text style={[styles.say, mark === 'overrule' && styles.strike]}>{turn.text}</Text>
        {turn.cites.length > 0 && <Cites cites={turn.cites} />}
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => onMark('sustain')} style={[styles.act, mark === 'sustain' && { backgroundColor: s.accent, borderColor: s.accent }]} accessibilityRole="button" accessibilityState={{ selected: mark === 'sustain' }}>
            <Text style={[styles.actText, mark === 'sustain' && styles.actTextOn]}>Sustain</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onMark('overrule')} style={[styles.act, mark === 'overrule' && styles.actOverruled]} accessibilityRole="button" accessibilityState={{ selected: mark === 'overrule' }}>
            <Text style={[styles.actText, mark === 'overrule' && styles.actTextOn]}>Overrule</Text>
          </TouchableOpacity>
          {turn.reply && (
            <TouchableOpacity onPress={() => setCrossed(!crossed)} style={[styles.act, styles.actCross, crossed && styles.actCrossOn]} accessibilityRole="button" accessibilityState={{ expanded: crossed }}>
              <Text style={[styles.actText, { color: colors.accent }, crossed && { color: '#fff' }]}>{crossed ? 'End cross-examination' : 'Cross-examine'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {crossed && turn.reply && (
          <Enter style={[styles.reply, { borderLeftColor: r.accent }]}>
            <Text style={[styles.replyName, { color: r.accent }]}>{r.name.toUpperCase()} ANSWERS</Text>
            <Text style={styles.say}>{turn.reply.text}</Text>
            {turn.reply.cites?.length > 0 && <Cites cites={turn.reply.cites} />}
          </Enter>
        )}
      </View>
    </Enter>
  );
}

// The beam tilts toward the side the officer has sustained more points for. Level means no weighing yet.
function Scale({ tilt }) {
  const angle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(angle, { toValue: tilt, friction: 5, tension: 60, useNativeDriver: false }).start();
  }, [tilt, angle]);
  const rotate = angle.interpolate({ inputRange: [-1, 1], outputRange: ['-13deg', '13deg'] });
  return (
    <View style={styles.scale} accessibilityLabel="Scale showing your own weighing of the points">
      <Animated.View style={[styles.beam, { transform: [{ rotate }] }]}>
        <View style={[styles.pan, { left: -4, backgroundColor: colors.success }]} />
        <View style={[styles.pan, { right: -4, backgroundColor: colors.danger }]} />
      </Animated.View>
      <View style={styles.fulcrum} />
    </View>
  );
}

function Gavel() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: false }),
      Animated.timing(a, { toValue: 0, duration: 140, useNativeDriver: false }),
      Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(a, { toValue: 0, duration: 140, useNativeDriver: false }),
    ]).start();
  }, [a]);
  return <Animated.Text style={[styles.gavel, { transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-35deg'] }) }] }]}>{'🔨'}</Animated.Text>;
}

export default function CourtroomCard({ review }) {
  const turns = useMemo(() => (review && review.debate) || [], [review]);
  const [heard, setHeard] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [typing, setTyping] = useState(null);
  const [marks, setMarks] = useState({});
  const [wide, setWide] = useState(false);
  const scroller = useRef(null);
  const marksTouched = useRef(false); // once the officer starts weighing points, stop moving the page under them

  useEffect(() => {
    if (!playing) { setTyping(null); return undefined; }
    if (heard >= turns.length) { setPlaying(false); setTyping(null); return undefined; }
    setTyping(turns[heard].side);
    const t = setTimeout(() => { setTyping(null); setHeard((h) => h + 1); }, TYPING_MS);
    return () => clearTimeout(t);
  }, [playing, heard, turns]);

  // Follow the hearing: each new speaker or bubble scrolls the left pane to the latest point.
  useEffect(() => {
    if (!wide || heard === 0) return undefined;
    const go = () => scroller.current?.scrollToEnd({ animated: false });
    const t1 = setTimeout(go, 80);
    const t2 = setTimeout(go, 450); // again once the bubble has finished sliding in
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [heard, typing, wide]);

  if (!review) return null;

  const sustainedFor = turns.filter((t, i) => i < heard && t.side === 'for' && marks[i] === 'sustain').length;
  const sustainedAgainst = turns.filter((t, i) => i < heard && t.side === 'against' && marks[i] === 'sustain').length;
  const tilt = Math.max(-1, Math.min(1, (sustainedAgainst - sustainedFor) / 3));
  const done = heard >= turns.length;
  const mark = (i, kind) => { marksTouched.current = true; setMarks((m) => ({ ...m, [i]: m[i] === kind ? undefined : kind })); };
  const skip = () => { setPlaying(false); setTyping(null); setHeard(turns.length); };
  const replay = () => { marksTouched.current = false; setMarks({}); setHeard(0); setPlaying(true); };

  return (
    <View style={styles.card} onLayout={(e) => setWide(e.nativeEvent.layout.width >= 860)}>
      <View style={styles.header}>
        <View style={styles.headTop}>
          <View style={styles.titleRow}>
            <Gavel />
            <Text style={styles.heading}>THE COURTROOM</Text>
          </View>
          <View style={styles.tag}><Text style={styles.tagText}>DECISION AID</Text></View>
        </View>
        <Text style={styles.subject}>In re {review.subject || 'this application'}</Text>
        <Text style={styles.aid}>{review.decisionAid}</Text>
        {review.eligible && review.reasons?.length > 0 && <Text style={styles.why}>Court is in session because: {review.reasons.join('; ')}.</Text>}
      </View>

      {!review.eligible ? (
        <View style={styles.body}>
          <Scale tilt={0} />
          <Text style={styles.dismissed}>Case dismissed: no contest</Text>
          <Text style={styles.noContestText}>{review.noContest}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.bench}>
            <View style={[styles.counsel, { borderColor: colors.success }]}>
              <Text style={[styles.counselName, { color: colors.success }]}>ADVOCATE</Text>
              <Text style={styles.counselRole}>for the applicant</Text>
            </View>
            <View style={styles.benchMid}>
              <Scale tilt={tilt} />
              <Text style={styles.weigh}>Your weighing: {sustainedFor} · {sustainedAgainst}</Text>
            </View>
            <View style={[styles.counsel, { borderColor: colors.danger }]}>
              <Text style={[styles.counselName, { color: colors.danger }]}>RISK REVIEWER</Text>
              <Text style={styles.counselRole}>for caution</Text>
            </View>
          </View>
          <Text style={styles.judge}>You are the judge. Sustain a point that persuades you, overrule one that does not, or cross-examine it to hear the other side answer.</Text>

          {review.degraded && (
            <View style={styles.degraded}><Text style={styles.degradedText}>{review.degradedNote}</Text></View>
          )}

          <View style={[styles.panes, wide && styles.panesWide]}>
            <View style={[styles.hearing, wide && styles.hearingWide]}>
              <Text style={styles.paneTitle}>THE HEARING</Text>
              <ScrollView
                ref={scroller}
                style={wide ? styles.hearingScroll : null}
                nestedScrollEnabled
                onContentSizeChange={() => { if (wide && heard > 0 && !marksTouched.current) scroller.current?.scrollToEnd({ animated: false }); }}
              >
                <Text style={styles.order}>{'“Order in the court. The risk reviewer will open.”'}</Text>
                {turns.slice(0, heard).map((t, i) => (
                  <Turn key={i} turn={t} mark={marks[i]} onMark={(k) => mark(i, k)} />
                ))}
                {typing && <Typing side={typing} />}
              </ScrollView>
              <View style={styles.controls}>
                <Text style={styles.progress}>{done ? `Court adjourned. ${turns.length} points heard.` : `Heard ${heard} of ${turns.length}`}</Text>
                {done ? (
                  <TouchableOpacity onPress={replay} style={styles.ctl} accessibilityRole="button"><Text style={styles.ctlText}>Replay the hearing</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={skip} style={styles.ctl} accessibilityRole="button"><Text style={styles.ctlText}>Skip to the end</Text></TouchableOpacity>
                )}
              </View>
            </View>

            <View style={[styles.report, wide && styles.reportWide]}>
              <Text style={styles.paneTitle}>FINAL REPORT</Text>
              {!done || !review.summary ? (
                <View>
                  <Text style={styles.reportWait}>The report is published when the hearing ends.</Text>
                  {[88, 70, 80, 56].map((w, i) => <View key={i} style={[styles.skeleton, { width: `${w}%` }]} />)}
                </View>
              ) : (
                <Enter>
                  <Text style={styles.reportFor}>{review.subject || 'This application'}: summary of the points heard</Text>
                  <Text style={[styles.reportHead, { color: colors.danger }]}>CONCERNS</Text>
                  {review.summary.concerns.length === 0 && <Text style={styles.reportLine}>None raised.</Text>}
                  {review.summary.concerns.map((c) => (
                    <View key={c} style={styles.reportRow}><Text style={[styles.bullet, { color: colors.danger }]}>{'●'}</Text><Text style={styles.reportLine}>{c}</Text></View>
                  ))}
                  <Text style={[styles.reportHead, { color: colors.success, marginTop: 12 }]}>IN THE APPLICANT'S FAVOUR</Text>
                  {review.summary.strengths.length === 0 && <Text style={styles.reportLine}>None raised.</Text>}
                  {review.summary.strengths.map((c) => (
                    <View key={c} style={styles.reportRow}><Text style={[styles.bullet, { color: colors.success }]}>{'●'}</Text><Text style={styles.reportLine}>{c}</Text></View>
                  ))}
                  <Text style={styles.closing}>A summary of what was argued. It is not a recommendation, nothing here is saved or sent, and the decision stays with you.</Text>
                </Enter>
              )}
            </View>
          </View>
        </View>
      )}

      <View style={styles.foot}>
        <Text style={styles.legend}>
          Tap a reference to see its evidence. S = application record, F = this applicant's file, P = the bank's approved policy
          {review.scripted ? ', ◆ X = scripted demo exhibit (not a live bank, payroll or background feed)' : ''}.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card, width: '100%', maxWidth: 1180 },
  header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gavel: { fontSize: 20 },
  heading: { color: '#FFFFFF', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  tag: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#D1E9FF', fontSize: 10, letterSpacing: 0.8, fontWeight: '700' },
  subject: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 8 },
  aid: { color: '#B2CCFF', fontSize: 12, marginTop: 4 },
  why: { color: '#D1E9FF', fontSize: 12, marginTop: 6 },
  body: { padding: 14, backgroundColor: '#FBFCFE' },
  bench: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  counsel: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, alignItems: 'center' },
  counselName: { fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  counselRole: { color: colors.faint, fontSize: 11, marginTop: 1 },
  benchMid: { alignItems: 'center', minWidth: 130 },
  weigh: { color: colors.muted, fontSize: 11, marginTop: 2 },
  judge: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  order: { color: colors.faint, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 12, marginBottom: 6 },
  scale: { height: 46, width: 140, alignItems: 'center', justifyContent: 'flex-start' },
  beam: { width: 120, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 8 },
  pan: { position: 'absolute', top: 4, width: 34, height: 12, borderBottomLeftRadius: 17, borderBottomRightRadius: 17, opacity: 0.9 },
  fulcrum: { position: 'absolute', top: 10, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 28, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.border, zIndex: -1 },
  turn: { marginTop: 10, maxWidth: '88%' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  bubble: { borderWidth: 1, borderRadius: 12, padding: 11 },
  discounted: { opacity: 0.55 },
  strike: { textDecorationLine: 'line-through' },
  speaker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  glyph: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  glyphText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  speakerName: { fontSize: 11, letterSpacing: 0.8, fontWeight: '700' },
  speakerRole: { color: colors.faint, fontSize: 11 },
  say: { color: colors.text, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3 },
  chipPolicy: { backgroundColor: colors.infoBg, borderColor: colors.infoBg },
  chipExhibit: { backgroundColor: colors.amberTint, borderColor: colors.amberBorder },
  chipOpen: { borderColor: colors.accent },
  chipText: { color: colors.neutral, fontSize: 11 },
  chipTextPolicy: { color: colors.info },
  chipTextExhibit: { color: colors.amberText },
  evidence: { marginTop: 8, backgroundColor: colors.card, borderLeftWidth: 3, borderLeftColor: colors.accent, borderRadius: 4, padding: 9 },
  evidenceHead: { color: colors.muted, fontSize: 11, marginBottom: 3 },
  evidenceText: { color: colors.text, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  act: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  actOverruled: { backgroundColor: colors.neutral, borderColor: colors.neutral },
  actCross: { borderColor: colors.accent },
  actCrossOn: { backgroundColor: colors.accent },
  actText: { color: colors.muted, fontSize: 12 },
  actTextOn: { color: '#FFFFFF' },
  reply: { marginTop: 10, borderLeftWidth: 3, paddingLeft: 10, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 4, paddingVertical: 8, paddingRight: 8 },
  replyName: { fontSize: 10, letterSpacing: 0.8, fontWeight: '700', marginBottom: 3 },
  typing: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 10 },
  typingName: { fontSize: 11, marginBottom: 4 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' },
  progress: { color: colors.muted, fontSize: 12 },
  ctl: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  ctlText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  panes: { marginTop: 12, gap: 12 },
  panesWide: { flexDirection: 'row', alignItems: 'stretch' },
  hearing: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, padding: 12 },
  hearingWide: { flex: 3 },
  hearingScroll: { height: 520 },
  report: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, padding: 14 },
  reportWide: { flex: 2 },
  paneTitle: { color: colors.faint, fontSize: 11, letterSpacing: 1.2, fontWeight: '700', marginBottom: 4 },
  reportWait: { color: colors.faint, fontSize: 13, fontStyle: 'italic', marginTop: 6, marginBottom: 14 },
  skeleton: { height: 10, borderRadius: 5, backgroundColor: colors.neutralBg, marginBottom: 10 },
  reportFor: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  reportHead: { fontSize: 11, letterSpacing: 1, fontWeight: '700', marginBottom: 6 },
  reportRow: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'flex-start' },
  bullet: { fontSize: 9, marginTop: 6 },
  reportLine: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 },
  closing: { color: colors.faint, fontSize: 12, marginTop: 14, fontStyle: 'italic' },
  dismissed: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  noContestText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4 },
  degraded: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 8, marginTop: 10 },
  degradedText: { color: colors.warning, fontSize: 12 },
  foot: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  legend: { color: colors.faint, fontSize: 11, lineHeight: 16 },
});
