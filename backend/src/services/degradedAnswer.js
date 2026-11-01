// What the assistant says when no chat model can write an answer. It never guesses: it shows the
// approved policy passages that retrieval already found (with their sources) and, when the
// question was about the application, the status that comes straight from the database.
const PASSAGES = 3;
const PASSAGE_CHARS = 420;

const clip = (text) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > PASSAGE_CHARS ? flat.slice(0, PASSAGE_CHARS).trimEnd() + '...' : flat;
};

export function buildDegradedAnswer({ evidence = [], statusText = '' } = {}) {
  const top = evidence.slice(0, PASSAGES);
  const parts = [];
  if (statusText) parts.push(statusText);
  if (top.length) {
    parts.push(
      'The assistant cannot write a full answer right now. These are the most relevant passages from our approved policies:',
      ...top.map((e) => `**${e.sourceTitle} - ${e.section}**\n${clip(e.text)}`),
      'Please check with your loan officer if anything is unclear.'
    );
  } else {
    parts.push('The assistant is not available right now, so I cannot look that up. Please try again in a few minutes or contact your loan officer.');
  }
  return {
    answer: parts.join('\n\n'),
    sources: top.map((e) => ({ doc: e.sourceTitle, section: e.section, source: e.sourceFile, chunkId: e.id, snippet: clip(e.text).slice(0, 220) })),
    degraded: true,
  };
}
