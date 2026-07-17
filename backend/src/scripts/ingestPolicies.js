import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb } from '../config/db.js';
import PolicyChunk from '../models/PolicyChunk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(__dirname, '../../../data/policies');

// Split a markdown doc on ## headings; each section becomes one chunk.
function chunkMarkdown(text) {
  return text
    .split(/\n(?=## )/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

function titleOf(markdown, fileName) {
  const m = markdown.match(/^# (.+)$/m);
  return m ? m[1].trim() : fileName;
}

async function run() {
  await connectDb();
  await PolicyChunk.deleteMany({});

  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.md'));
  let total = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(POLICY_DIR, file), 'utf8');
    const sourceDoc = titleOf(raw, file);
    const chunks = chunkMarkdown(raw);
    await PolicyChunk.insertMany(chunks.map((text, i) => ({ sourceDoc, chunkIndex: i, text })));
    total += chunks.length;
    console.log(`Indexed ${chunks.length} chunks from "${sourceDoc}"`);
  }

  console.log(`Done — ${total} chunks in the policy corpus.`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
