import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../theme';

// What the assistant is doing while it works, shown as it happens: the steps already finished get a tick,
// the current one is live, and a thin bar shows how far along it is. The steps are a guide to the real
// order of work (the server does not report progress), so the last step stays on screen until the answer
// arrives rather than pretending to finish early.

export const PROGRESS_STEPS = {
  review: {
    title: 'The court is assembling',
    steps: [
      'Calling the application record to the stand',
      'Hearing the document checks',
      "Searching the applicant's file for exhibits",
      'Pulling the approved policy that applies',
      'Briefing both counsel',
      'Checking every claim against its evidence',
    ],
  },
  brief: {
    title: 'Preparing the brief',
    steps: [
      'Reading the application record',
      'Collecting the document checks',
      'Finding the policy behind each finding',
      'Writing it up',
    ],
  },
  chat: {
    title: 'Working on your question',
    steps: [
      'Reading your question',
      'Searching the application file and approved policies',
      'Checking the answer against its sources',
    ],
  },
};

export default function AgentProgress({ kind = 'chat', intervalMs = 1800 }) {
  const { title, steps } = PROGRESS_STEPS[kind] || PROGRESS_STEPS.chat;
  const [index, setIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0.35)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), intervalMs);
    return () => clearInterval(timer);
  }, [steps.length, intervalMs]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    Animated.timing(bar, { toValue: (index + 1) / (steps.length + 1), duration: 500, useNativeDriver: false }).start();
  }, [index, steps.length, bar]);

  return (
    <View style={styles.box} accessibilityLiveRegion="polite" accessibilityLabel={`${title}: ${steps[index]}`}>
      <View style={styles.head}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      {steps.slice(0, index + 1).map((step, i) => {
        const current = i === index;
        return (
          <View key={step} style={styles.row}>
            {current ? (
              <Animated.View style={[styles.dot, { opacity: pulse }]} />
            ) : (
              <Text style={styles.tick}>{'✓'}</Text>
            )}
            <Text style={[styles.step, current ? styles.stepNow : styles.stepDone]}>{step}{current ? '…' : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minWidth: 250 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { color: colors.text, fontSize: 14 },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.neutralBg, overflow: 'hidden', marginBottom: 10 },
  fill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginHorizontal: 2 },
  tick: { color: colors.success, fontSize: 12, width: 12, textAlign: 'center' },
  step: { fontSize: 13, flexShrink: 1 },
  stepNow: { color: colors.text },
  stepDone: { color: colors.faint },
});
