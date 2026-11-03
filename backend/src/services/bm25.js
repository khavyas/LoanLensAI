// Keyword search (BM25) over a small set of text chunks, in memory. It complements the meaning-based
// (vector) search: vectors are good at paraphrase ("Is a screenshot of my balance okay?"), keywords
// are good at exact things a loan policy is full of: "5%", "$75,000", "W-2", "bi-weekly", "DBA".

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'and', 'or', 'but', 'if', 'it', 'its', 'as', 'with', 'from', 'that', 'this', 'these', 'those',
  'what', 'which', 'who', 'how', 'when', 'where', 'why', 'can', 'could', 'will', 'would', 'should', 'have', 'has', 'had', 'there', 'than', 'then',
  'about', 'into', 'any', 'so', 'up', 'out', 'get',
]);

// Light stemming, applied to documents and queries alike, so "documents" matches "document" and
// "approved" matches "approve". Not linguistically perfect, just consistent.
function stem(token) {
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 4 && token.endsWith('sses')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  return token;
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 75,000 -> 75000
    .replace(/[‘’]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[$]/g, '')
    .replace(/-/g, ' ')
    .match(/[a-z0-9]+%?/g)
    ?.filter((t) => !STOP.has(t) && t.length > 0)
    .map(stem) || [];
}

export function buildBm25Index(docs, { k1 = 1.5, b = 0.75 } = {}) {
  const entries = docs.map((d) => {
    const tokens = tokenize(d.text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { id: d.id, length: tokens.length, tf };
  });
  const df = new Map();
  for (const e of entries) for (const t of e.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = entries.length ? entries.reduce((s, e) => s + e.length, 0) / entries.length : 0;
  const N = entries.length;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

  return {
    size: N,
    // Returns [{ id, score, matched }] best first; matched = how many distinct query terms the chunk contains.
    search(query, limit = 20) {
      const terms = [...new Set(tokenize(query))].filter((t) => df.has(t));
      return entries
        .map((e) => {
          let score = 0;
          let matched = 0;
          for (const t of terms) {
            const f = e.tf.get(t);
            if (!f) continue;
            matched += 1;
            score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * e.length) / (avg || 1))));
          }
          return { id: e.id, score, matched };
        })
        .filter((r) => r.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, limit);
    },
  };
}
