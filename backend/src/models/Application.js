import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    applicantName: { type: String, required: true },
    applicantEmail: { type: String, required: true },
    productType: { type: String, enum: ['auto-loan', 'personal-loan'], required: true },
    statedMonthlyIncome: { type: Number, required: true },
    employerName: String,
    address: String,
    ssnLast4: String,
    requestedAmount: Number,
    status: {
      type: String,
      enum: ['draft', 'submitted', 'needs-review', 'approved', 'rejected'],
      default: 'submitted',
    },
    // Document types this product requires; verification checks uploads against it.
    requiredDocTypes: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model('Application', applicationSchema);
