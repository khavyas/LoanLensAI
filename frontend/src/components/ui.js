import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
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

// A password TextInput with a show/hide toggle — used on login and sign-up.
// No icon library in this app yet, so the toggle is a plain emoji rather than
// pulling in a new dependency for one button.
export function PasswordField({ style, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.passwordRow, style]}>
      <TextInput
        style={styles.passwordInput}
        placeholderTextColor={colors.faint}
        secureTextEntry={!visible}
        {...inputProps}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        style={styles.passwordToggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.passwordToggleIcon}>{visible ? '🙈' : '👁️'}</Text>
      </TouchableOpacity>
    </View>
  );
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#FCFDFE',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  passwordToggle: { paddingHorizontal: 12 },
  passwordToggleIcon: { fontSize: 16 },
});
