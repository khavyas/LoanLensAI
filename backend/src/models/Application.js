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
    // Auto-loan/personal-loan only — used for employment verification calls,
    // a standard field on a real loan application (URLA-style).
    employerPhone: String,
    address: String,
    ssnLast4: String,
    dateOfBirth: Date,
    requestedAmount: Number,
    // Borrower-chosen term, from the product's fixed set of offered terms
    // (see config/affordability.js) — drives both the displayed monthly
    // payment estimate and the affordability ceiling, instead of assuming a
    // single fixed term for everyone.
    repaymentTermMonths: Number,
    // Free-text purpose of the loan — standard on a real application, and
    // useful context for an officer reviewing the file.
    loanReason: String,
    // Small-business loans only: legal/DBA name as stated on the application,
    // cross-checked against the business license and tax return uploads.
    businessName: String,
    statedAnnualBusinessRevenue: Number,
    status: {
      type: String,
      // 'referred' = a loan officer sent it to an underwriter for an exception.
      enum: ['draft', 'submitted', 'needs-review', 'referred', 'approved', 'rejected'],
      default: 'submitted',
    },
    // Document types this product requires; verification checks uploads against it.
    requiredDocTypes: [{ type: String }],
    // E-sign / credit-pull authorization, captured at application submission —
    // required before an application can be created (see routes/applications.js).
    consentAcceptedAt: Date,
    // Entered by staff from the credit report (no bureau integration yet).
    creditProfile: {
      score: Number,
      enteredBy: String,
      enteredAt: Date,
    },
    // Final outcome. `exception` is set only when an underwriter approved a
    // file that missed waivable parameters; it is internal and never shown to
    // the borrower (see borrowerNotice in services/decisionRules.js).
    decision: {
      outcome: { type: String, enum: ['approved', 'rejected'] },
      reason: String,
      conditions: [String],
      decidedBy: { name: String, email: String, role: String },
      decidedAt: Date,
      exception: {
        waivedParameters: [String],
        compensatingFactors: String,
        relationshipNote: String,
        conditions: [String],
      },
    },
    // Append-only audit trail of every review action.
    reviewHistory: [
      {
        at: Date,
        actor: { name: String, email: String, role: String },
        action: String,
        note: String,
        details: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Application', applicationSchema);
