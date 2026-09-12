import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    fileName: String,
    docType: String, // pay-stub | w2 | bank-statement | drivers-license | unknown
    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidence: { type: Number, default: 0 }, // 0..1 from the extraction model
    // When a borrower re-uploads a fix for a flagged document, the old one is
    // marked 'superseded' rather than deleted — keeps a full audit trail while
    // only the 'current' document of each docType counts toward requirements
    // and open exceptions.
    status: { type: String, enum: ['current', 'superseded'], default: 'current' },
    supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    // Set when the borrower used a targeted re-upload for a specific required
    // item; lets verification flag a wrong-file upload immediately.
    expectedDocType: String,
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
