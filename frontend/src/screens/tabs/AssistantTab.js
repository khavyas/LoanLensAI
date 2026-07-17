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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {messages.length === 0 && (
          <View>
            <Text style={styles.intro}>
              Ask anything about this application. Answers come only from First Community Bank policy
              documents and this loan file — with citations.
            </Text>
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
                  <Text key={j} style={styles.source}>
                    📄 {s.doc}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
        {busy && <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask about this application…"
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
  intro: { color: colors.muted, marginBottom: 12 },
  suggestion: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  suggestionText: { color: colors.accent, fontWeight: '600' },
  bubble: { borderRadius: 14, padding: 12, marginBottom: 10, maxWidth: '85%' },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  aiBubble: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: { color: '#fff' },
  aiText: { color: colors.text },
  sources: { marginTop: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 6 },
  source: { color: colors.muted, fontSize: 12 },
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
