const MAX_PDF_PAGES = 150;

export async function extractPolicyText(fileName, buffer) {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'md' || extension === 'txt') {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  }
  if (extension !== 'pdf') throw new Error('Upload a Markdown, TXT, or PDF policy document.');
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('This file is not a valid PDF.');

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('PDF exceeds the ' + MAX_PDF_PAGES + '-page limit.');
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' '));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    if (!text) throw new Error('This PDF contains no selectable text. Scanned PDFs need OCR before upload.');
    return text;
  } finally {
    await task.destroy();
  }
}
