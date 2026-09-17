import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { PasswordField } from '../components/ui';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
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
          LoanLens <Text style={{ color: colors.accent }}>AI</Text>
        </Text>
        <Text style={styles.tagline}>Intelligent loan document review &amp; assistance</Text>

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
        <PasswordField
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onLogin}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={onLogin} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signupLink} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.signupLinkText}>New here? Create a test account</Text>
        </TouchableOpacity>

        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Demo accounts</Text>
          <Text style={styles.demoLine}>Loan officer · officer@loanlens.demo</Text>
          <Text style={styles.demoLine}>Borrower · borrower@loanlens.demo</Text>
          <Text style={styles.demoLine}>Password · demo1234</Text>
        </View>
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
    fontSize: 32,
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginBottom: 10, fontSize: 13 },
  signupLink: { marginTop: 14, alignItems: 'center' },
  signupLinkText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  demoBox: {
    marginTop: 24,
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoTitle: { fontSize: 11, fontWeight: '700', color: colors.faint, letterSpacing: 1, marginBottom: 4 },
  demoLine: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  foot: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});
