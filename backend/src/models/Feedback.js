import mongoose from 'mongoose';

// A thumbs up or down on one assistant answer (RAG plan P7-06). Question, answer and comment are
// stored AFTER redaction, so an identifier typed into the chat is not kept. Rated-down answers are
// the best source of new golden questions.
const feedbackSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    role: String,
    rating: { type: String, enum: ['up', 'down'], required: true },
    comment: String,
    question: String,
    answer: String,
    sources: [{ doc: String, section: String, source: String, kind: String }],
    promptVersion: String,
    retrievalMode: String,
  },
  { timestamps: true }
);

export default mongoose.model('Feedback', feedbackSchema);
