import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    applicantName: { type: String, required: true },
    applicantEmail: { type: String, required: true },
    productType: {
      type: String,
      enum: ['auto-loan', 'personal-loan', 'small-business-loan'],
      required: true,
    },
    // Required for auto-loan/personal-loan; small-business-loan uses
    // statedAnnualBusinessRevenue instead.
    statedMonthlyIncome: Number,
    employerName: String,
    address: String,
    ssnLast4: String,
    requestedAmount: Number,
    // Small-business loans only: legal/DBA name as stated on the application,
    // cross-checked against the business license and tax return uploads.
    businessName: String,
    statedAnnualBusinessRevenue: Number,
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
