import crypto from 'node:crypto';

// NEW: Deterministic Markdown section chunking for approved policy ingestion.
export function chunkPolicyMarkdown(markdown, sourceFile, modifiedAt) {
  const documentId = `policy-${crypto.createHash('sha256').update(sourceFile).digest('hex').slice(0, 20)}`;
  const sections = markdown.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '')
    .split(/\n(?=##?\s+)/)
    .map((text) => text.trim())
    .filter((text) => text.length > 40);

  const records = [];
  const sourceTitle = (markdown.match(/^#\s+(.+)$/m)?.[1] || sourceFile).trim();
  for (const sectionText of sections) {
    const heading = sectionText.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() || sourceFile;
    const paragraphs = sectionText.split(/\n\s*\n/).filter(Boolean);
    let chunkText = '';
    const flush = () => {
      const text = chunkText.trim();
      if (text.length > 40) records.push({ text, heading });
      chunkText = '';
    };

    for (const paragraph of paragraphs) {
      if (paragraph.length > 1200) {
        flush();
        let start = 0;
        while (start < paragraph.length) {
          let end = Math.min(start + 1200, paragraph.length);
          if (end < paragraph.length) {
            const boundary = paragraph.lastIndexOf(' ', end);
            if (boundary > start + 700) end = boundary;
          }
          const text = paragraph.slice(start, end).trim();
          if (text.length > 40) records.push({ text, heading });
          start = Math.max(end - 120, start + 1);
        }
      } else if (chunkText && chunkText.length + paragraph.length + 2 > 1200) {
        flush();
        chunkText = paragraph;
      } else {
        chunkText += `${chunkText ? '\n\n' : ''}${paragraph}`;
      }
    }
    flush();
  }

  return records.map(({ text, heading }, chunkIndex) => {
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');
    const id = crypto.createHash('sha256').update(`${documentId}:${chunkIndex}:${contentHash}`).digest('hex');
    return {
      id,
      text,
      metadata: { documentId, sourceFile, sourceTitle, section: heading, category: 'loan-policy', chunkIndex, contentHash, modifiedAt },
    };
  });
}
