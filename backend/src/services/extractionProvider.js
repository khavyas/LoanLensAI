import { classifyAndExtract as classifyAndExtractAnthropic } from './extraction.js';
import { classifyAndExtractGroq } from './extractionGroq.js';

// Switches which vision provider actually runs document classification +
// field extraction, without touching either provider's own file — set
// EXTRACTION_PROVIDER=groq on Render to use Groq (free, works today);
// leave unset/anything else to keep using Claude once ANTHROPIC_API_KEY is
// approved. MOCK_AI still short-circuits both providers identically, so
// switching this never changes demo/test behavior while MOCK_AI=true.
const PROVIDER = (process.env.EXTRACTION_PROVIDER || 'anthropic').toLowerCase();

export function classifyAndExtract(filePath, mimeType, originalFilename) {
  if (PROVIDER === 'groq') return classifyAndExtractGroq(filePath, mimeType, originalFilename);
  return classifyAndExtractAnthropic(filePath, mimeType, originalFilename);
}
