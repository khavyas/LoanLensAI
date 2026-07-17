import mongoose from 'mongoose';

// One chunk of a bank policy document for RAG grounding. `embedding` is
// unused in the POC (all chunks fit in context) but kept for the
// vector-search upgrade path.
const policyChunkSchema = new mongoose.Schema({
  sourceDoc: { type: String, required: true }, // e.g. "Auto Loan Requirements"
  chunkIndex: Number,
  text: { type: String, required: true },
  embedding: { type: [Number], default: undefined },
});

export default mongoose.model('PolicyChunk', policyChunkSchema);
