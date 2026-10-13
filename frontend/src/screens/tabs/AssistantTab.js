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

const STATUS_VALUE_PATTERN = /^(?:unknown|submitted|under review|in review|needs review|approved|rejected|declined|failed|pending|denied|cancelled|canceled|funded)$/i;

function getHighlightIntent(question) {
  return {
    status: /\b(?:status|approved|approval|rejected|declined|failed|pending|under review|needs review|progress)\b/i.test(question),
    missingDocuments: /\b(?:missing|still need|documents? do i need|documents? needed|outstanding documents?)\b/i.test(question),
  };
}

function renderInlineText(text, baseStyle, highlight) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const emphasized = part.startsWith('**') && part.endsWith('**');
    const emphasizedValue = emphasized ? part.slice(2, -2).trim() : part;
    const emphasizeForQuestion = !highlight || (STATUS_VALUE_PATTERN.test(emphasizedValue)
      ? highlight.status
      : highlight.missingDocuments);
    return (
      <Text key={index} style={[baseStyle, emphasized && emphasizeForQuestion && styles.answerEmphasis]}>
        {emphasized ? emphasizedValue : part}
      </Text>
    );
  });
}

function AnswerBody({ text, highlight }) {
  const markers = [...text.matchAll(/(?:^|\s)(?:\((\d+)\)|(\d+)[.)]|\[(\d+)\])\s*/g)];
  if (markers.length < 2) {
    return <Text style={styles.aiText}>{renderInlineText(text, styles.aiText, highlight)}</Text>;
  }

  const first = markers[0];
  const intro = text.slice(0, first.index).trim();
  return (
    <View>
      {!!intro && <Text style={[styles.aiText, styles.answerIntro]}>{renderInlineText(intro, styles.aiText, highlight)}</Text>}
      <View style={styles.answerList}>
        {markers.map((marker, index) => {
          const start = marker.index + marker[0].length;
          const end = markers[index + 1]?.index ?? text.length;
          const item = text.slice(start, end).trim();
          return (
            <View key={`${marker.index}-${index}`} style={styles.answerListItem}>
              <Text style={styles.answerListNumber}>{marker[1] || marker[2] || marker[3]}.</Text>
              <Text style={[styles.aiText, styles.answerListText]}>{renderInlineText(item, styles.aiText, highlight)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function AssistantTab({ app }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const { answer, sources } = await api.ask(app._id, question, history);
      setMessages((m) => [...m, {
        from: 'ai',
        text: answer,
        sources,
        highlight: getHighlightIntent(question),
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
        {messages.length === 0 && (
          <View>
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
            {m.from === 'user' ? (
              <Text style={styles.userText}>{m.text}</Text>
            ) : (
              <AnswerBody text={m.text} highlight={m.highlight} />
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
