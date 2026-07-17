import { View, Text, StyleSheet } from 'react-native';
import { colors, shadow } from '../theme';

const TONES = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  neutral: { bg: colors.neutralBg, fg: colors.neutral },
};

export function Pill({ tone = 'neutral', children }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Card({ style, children }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Overline({ children }) {
  return <Text style={styles.overline}>{children}</Text>;
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.faint,
    textTransform: 'uppercase',
  },
});
