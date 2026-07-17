import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    fileName: String,
    docType: String, // pay-stub | w2 | bank-statement | drivers-license | unknown
    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidence: { type: Number, default: 0 }, // 0..1 from the extraction model
    verification: {
      checks: [
        {
          field: String,
          expected: String,
          found: String,
          status: { type: String, enum: ['match', 'mismatch', 'warning', 'missing'] },
          explanation: String,
        },
      ],
      overall: { type: String, enum: ['pass', 'needs-review', 'fail'], default: 'needs-review' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Document', documentSchema);
