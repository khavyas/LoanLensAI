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
import { handleLocalIntent } from '../../assistantActions';
import { goToApplicationTab } from '../../navigationRef';
import AnswerText from '../../components/AnswerText';

// Sample questions, grouped by what they open. The first three groups are
// answered from the application's own data and jump to the matching page; the
// Policy group goes to the assistant's policy knowledge base.
const SAMPLE_GROUPS = {
  borrower: [
    { title: 'Documents', questions: ['What documents have I uploaded?', 'What documents do I still need?'] },
    { title: 'Progress', questions: ['What is the progress of my application?', 'What is my application status?'] },
    { title: 'Verification', questions: ['Show my verification results', 'Why is my application in review?'] },
    { title: 'Policy', questions: ['What documents do I need for a car loan?', 'How long until a decision?', 'Is a co-signer allowed?'] },
  ],
  officer: [
    { title: 'Documents', questions: ['Show the uploaded documents', 'Which documents are missing?'] },
    { title: 'Progress', questions: ['Where is this application in the process?', 'What is the next step?'] },
    { title: 'Verification', questions: ['Show the verification checks', 'Why is this application flagged?'] },
    { title: 'Policy', questions: ['What is the income tolerance policy?', 'What are the small business loan requirements?'] },
  ],
  underwriter: [
    { title: 'Exception review', questions: ['Why was this application referred?', 'Which parameters are not met?', 'What is the credit score on this file?'] },
    { title: 'Documents', questions: ['Show the uploaded documents', 'Show the verification checks'] },
    { title: 'Progress', questions: ['Where is this application in the process?'] },
    { title: 'Policy', questions: ['What is the income tolerance policy?', 'What are the small business loan requirements?'] },
  ],
};

export default function AssistantTab({ app, autoNavigate = true }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const scrollRef = useRef(null);

  async function send(text) {
    const question = (text || input).trim();
    if (!question || busy) return;
    // NEW: Send only prior user turns for follow-up context; assistant answers are never trusted as evidence.
    const history = messages
      .filter((message) => message.from === 'user')
      .slice(-4)
      .map((message) => ({ role: 'user', content: message.text }));
    setInput('');
    setMessages((m) => [...m, { from: 'user', text: question }]);
    setShowSamples(false);
    setBusy(true);
    try {
      // Questions about this application's own state are answered from its
      // data and open the matching page; anything else goes to the assistant.
      const local = await handleLocalIntent(question, app, user.role).catch(() => null);
      if (local) {
        setMessages((m) => [...m, {
          from: 'ai',
          text: local.answer,
          sources: local.sources,
          nav: { tab: local.tab, label: local.label, applicationId: local.applicationId },
        }]);
        if (autoNavigate) goToApplicationTab(local.applicationId, local.tab);
        return;
      }
      const { answer, sources } = await api.ask(app._id, question, history);
      setMessages((m) => [...m, {
        from: 'ai',
        text: answer,
        sources,
      }]);
    } catch (e) {
      setMessages((m) => [...m, { from: 'ai', text: `Sorry — ${e.message}`, sources: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    // The persistent chat panel owns the width; let the conversation fill its
    // available space so the composer and messages do not collapse on web.
    <KeyboardAvoidingView
      style={{ flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 14, paddingBottom: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {(messages.length === 0 || showSamples) && (
          <View>
            <Text style={styles.suggestLabel}>Try asking</Text>
            {(SAMPLE_GROUPS[user.role] || SAMPLE_GROUPS.borrower).map((g) => (
              <View key={g.title} style={{ marginBottom: 6 }}>
                <Text style={styles.groupTitle}>{g.title}</Text>
                {g.questions.map((q) => (
                  <TouchableOpacity key={q} style={styles.suggestion} onPress={() => send(q)}>
                    <Text style={styles.suggestionText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === 'user' ? styles.userBubble : styles.aiBubble]}>
            {m.from === 'user' ? (
              <Text style={styles.userText}>{m.text}</Text>
            ) : (
              <AnswerText text={m.text} />
            )}
            {m.nav && (
              <TouchableOpacity
                style={styles.navChip}
                onPress={() => goToApplicationTab(m.nav.applicationId, m.nav.tab)}
              >
                <Text style={styles.navChipText}>{autoNavigate ? 'Opened' : 'Open'} {m.nav.label} →</Text>
              </TouchableOpacity>
            )}
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

      {messages.length > 0 && !showSamples && (
        <TouchableOpacity style={styles.samplesToggle} onPress={() => setShowSamples(true)}>
          <Text style={styles.samplesToggleText}>💡 Sample questions</Text>
        </TouchableOpacity>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask about this application…"
          placeholderTextColor={colors.faint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={() => send()} disabled={busy}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  suggestLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  groupTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, marginTop: 4 },
  navChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.infoBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  navChipText: { color: colors.info, fontSize: 12, fontWeight: '700' },
  samplesToggle: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.bg },
  samplesToggleText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
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
  answerEmphasis: { fontWeight: '800', color: colors.primary },
  answerIntro: { marginBottom: 8 },
  answerList: { width: '100%', gap: 8 },
  answerListItem: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  answerListText: { flex: 1, minWidth: 0 },
  answerListNumber: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '800' },
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
    flexShrink: 0,
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
