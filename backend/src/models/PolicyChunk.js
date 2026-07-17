import mongoose from 'mongoose';

// One chunk of a bank policy document, with its embedding for RAG retrieval.
const policyChunkSchema = new mongoose.Schema({
  sourceDoc: { type: String, required: true }, // e.g. "Auto Loan Requirements"
  chunkIndex: Number,
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
});

export default mongoose.model('PolicyChunk', policyChunkSchema);
