import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

// Renders an assistant reply so it can be scanned at a glance:
//
//   ## Heading          a bold title line
//   - item              a bullet
//   1. item             a numbered item
//   > note              a highlighted callout (next step, what is still needed)
//   **bold**            emphasis; status words are also coloured
//   blank line          a paragraph break
//
// Replies without line breaks (typically model-written) fall back to splitting
// inline "1. … 2. …" lists, so older answers still read well.

const GOOD = /^(passed|met|approved|matched|clear|verified|complete|received|nothing needs action)$/i;
const BAD = /^(failed|not met|rejected|declined|mismatch|flagged|expired)$/i;
const WARN = /^(needs review|needs entry|pending|referred|referred to the underwriter|with underwriter|not uploaded yet)$/i;

function Inline({ text, style }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (!(part.startsWith('**') && part.endsWith('**'))) return part;
        const word = part.slice(2, -2).trim();
        const tone = GOOD.test(word) ? colors.success : BAD.test(word) ? colors.danger : WARN.test(word) ? colors.warning : null;
        return (
          <Text key={i} style={[styles.bold, tone && { color: tone }]}>
            {word}
          </Text>
        );
      })}
    </Text>
  );
}

function parseBlocks(text) {
  const blocks = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: 'gap' });
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', text: line.slice(3) });
    } else if (line.startsWith('- ')) {
      blocks.push({ type: 'bullet', text: line.slice(2) });
    } else if (/^\d+[.)]\s/.test(line)) {
      blocks.push({ type: 'number', n: line.match(/^(\d+)/)[1], text: line.replace(/^\d+[.)]\s+/, '') });
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'callout', text: line.slice(2) });
    } else {
      blocks.push({ type: 'para', text: line });
    }
  }
  return blocks;
}

// Model replies that put a whole numbered list on one line.
function splitInlineList(text) {
  const markers = [...text.matchAll(/(?:^|\s)(?:\((\d+)\)|(\d+)[.)]|\[(\d+)\])\s*/g)];
  if (markers.length < 2) return text;
  const intro = text.slice(0, markers[0].index).trim();
  const items = markers.map((m, i) => {
    const start = m.index + m[0].length;
    const end = markers[i + 1]?.index ?? text.length;
    return `${m[1] || m[2] || m[3]}. ${text.slice(start, end).trim()}`;
  });
  return [intro, ...items].filter(Boolean).join('\n');
}

export default function AnswerText({ text }) {
  const source = String(text || '');
  const blocks = parseBlocks(source.includes('\n') ? source : splitInlineList(source));

  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'gap') return <View key={i} style={{ height: 6 }} />;
        if (b.type === 'heading') {
          return <Inline key={i} text={b.text} style={[styles.heading, i > 0 && { marginTop: 4 }]} />;
        }
        if (b.type === 'callout') {
          return (
            <View key={i} style={styles.callout}>
              <Inline text={b.text} style={styles.calloutText} />
            </View>
          );
        }
        if (b.type === 'bullet' || b.type === 'number') {
          return (
            <View key={i} style={styles.listRow}>
              <Text style={styles.marker}>{b.type === 'bullet' ? '•' : `${b.n}.`}</Text>
              <Inline text={b.text} style={[styles.body, { flex: 1 }]} />
            </View>
          );
        }
        return <Inline key={i} text={b.text} style={[styles.body, i > 0 && { marginTop: 4 }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.primary, fontSize: 15, fontWeight: '800', lineHeight: 21, marginBottom: 4 },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  bold: { fontWeight: '800', color: colors.primary },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, paddingLeft: 2 },
  marker: { color: colors.accent, fontSize: 14, lineHeight: 21, fontWeight: '800', minWidth: 14 },
  callout: {
    backgroundColor: colors.infoBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  calloutText: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
