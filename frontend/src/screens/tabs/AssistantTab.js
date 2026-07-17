import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme';

const SUGGESTIONS = {
  borrower: ['What documents do I still need?', 'Why is my application in review?', 'How long until a decision?'],
  officer: ['Why is this application flagged?', 'What is the income tolerance policy?', 'What has been submitted so far?'],
};

export default function AssistantTab({ app }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  async function send(text) {
    const question = (text || input).trim();
    if (!question || busy) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text: question }]);
    setBusy(true);
    try {
      const { answer, sources } = await api.ask(app._id, question);
      setMessages((m) => [...m, { from: 'ai', text: answer, sources }]);
    } catch (e) {
      setMessages((m) => [...m, { from: 'ai', text: `Sorry — ${e.message}`, sources: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {messages.length === 0 && (
          <View>
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>LoanLens Assistant</Text>
              <Text style={styles.intro}>
                Every answer is grounded in First Community Bank policy documents and this loan file,
                with sources cited. A loan officer always makes the final decision.
              </Text>
            </View>
            <Text style={styles.suggestLabel}>Try asking</Text>
            {SUGGESTIONS[user.role].map((s) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => send(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={m.from === 'user' ? styles.userText : styles.aiText}>{m.text}</Text>
            {m.sources?.length > 0 && (
              <View style={styles.sources}>
                {m.sources.map((s, j) => (
                  <View key={j} style={styles.sourceChip}>
                    <Text style={styles.sourceText}>{s.doc}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        {busy && (
          <View style={[styles.bubble, styles.aiBubble, styles.typing]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.typingText}>Checking policy documents…</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask about this application…"
          placeholderTextColor={colors.faint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={() => send()} disabled={busy}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  introCard: {
    backgroundColor: colors.infoBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1E4FF',
  },
  introTitle: { fontWeight: '800', color: colors.info, marginBottom: 4, fontSize: 15 },
  intro: { color: colors.info, fontSize: 13, lineHeight: 19 },
  suggestLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  suggestion: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  suggestionText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  bubble: { borderRadius: 12, padding: 14, marginBottom: 10, maxWidth: '85%' },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  aiText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceChip: {
    backgroundColor: colors.neutralBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sourceText: { color: colors.neutral, fontSize: 11, fontWeight: '600' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { color: colors.muted, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#FCFDFE',
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
