import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const ROLES = [
  { value: 'borrower', label: 'Borrower' },
  { value: 'officer', label: 'Loan Officer' },
];

export default function SignUpScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('borrower');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, role });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.bank}>FIRST COMMUNITY BANK</Text>
        <Text style={styles.logo}>
          Create a <Text style={{ color: colors.accent }}>test account</Text>
        </Text>
        <Text style={styles.tagline}>For trying out LoanLens AI — not a real bank account</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput
          style={styles.input}
          placeholder="Jordan Rivera"
          placeholderTextColor={colors.faint}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
        />

        <Text style={styles.label}>I am a</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
              onPress={() => setRole(r.value)}
            >
              <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.foot}>Demo environment · synthetic data only · AI answers are cited and human-reviewed</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primary, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  bank: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.faint,
    textAlign: 'center',
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 4,
  },
  tagline: { color: colors.muted, textAlign: 'center', marginBottom: 28, marginTop: 6, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FCFDFE',
  },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#FCFDFE',
  },
  roleBtnActive: { borderColor: colors.accent, backgroundColor: colors.infoBg },
  roleBtnText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  roleBtnTextActive: { color: colors.accent },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginBottom: 10, fontSize: 13 },
  backLink: { marginTop: 18, alignItems: 'center' },
  backLinkText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  foot: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});
