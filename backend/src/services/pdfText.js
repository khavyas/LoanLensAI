// Reads the selectable text out of every page of a PDF, with no AI call (so no
// tokens, no rate limit, and a 150-page file takes seconds, not minutes).
// A scanned PDF has no text layer; the caller sees that as textLayer: false.

const HARD_PAGE_CAP = 400;

// pdf.js hands back loose text fragments with x/y positions. Fragments on the
// same visual row are stitched into one line (left to right), rows top to
// bottom, so "date  description  amount" comes out as a single readable line.
function pageItemsToLines(items) {
  const rows = new Map();
  for (const item of items) {
    const text = (item.str || '').trim();
    if (!text) continue;
    const y = Math.round(item.transform[5] / 3);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: item.transform[4], text });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' '));
}

export async function readPdfPages(buffer, { maxPages = HARD_PAGE_CAP } = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  try {
    const pagesTotal = pdf.numPages;
    const limit = Math.min(pagesTotal, maxPages);
    const pages = [];
    for (let n = 1; n <= limit; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(pageItemsToLines(content.items));
      page.cleanup();
    }
    const charCount = pages.reduce((sum, lines) => sum + lines.join('').length, 0);
    return {
      pagesTotal,
      pagesRead: limit,
      pages, // string[][] - lines per page
      textLayer: charCount > 200, // some real text, not just stray marks
    };
  } finally {
    await task.destroy();
  }
}
