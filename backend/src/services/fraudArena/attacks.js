// The forgery catalogue for the Fraud Arena (plan FA-02, FA-03). Each attack edits the structured
// fields a document yields after extraction, the way a forger's edit would show up, and states what
// the current checks are EXPECTED to do with it:
//   expected: 'caught'  the checks should flag it
//   expected: 'miss'    a known limit of checking documents against each other; we say so openly
//   expected: 'partial' depends on the size of the edit; either outcome is expected, the rate is the result
//   expected: 'clean'   a control with no tampering: any flag is a false alarm
// A surprise is any result that differs from its expectation, in either direction.
//
// These attacks test the CHECKS on structured data. They do not test reading a doctored image: that
// needs the live vision model (plan FA-12).

const money = (n) => Math.round(n * 100) / 100;
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

const doc = (clone, type) => clone.docs.find((d) => d.docType === type);

// Every edit is recorded so the screen can show what was changed.
function setField(clone, type, field, to) {
  const d = doc(clone, type);
  const from = d.fields[field];
  d.fields[field] = to;
  clone.changes.push({ doc: type, field, from: from ?? null, to });
}
function setApplication(clone, field, to) {
  clone.changes.push({ doc: 'application', field, from: clone.application[field] ?? null, to });
  clone.application[field] = to;
}

// A pay stub whose every line agrees with a new, higher income (what a careful forger produces).
function rescaleStub(clone, k) {
  const s = doc(clone, 'pay-stub').fields;
  setField(clone, 'pay-stub', 'grossMonthlyIncome', money(s.grossMonthlyIncome * k));
  setField(clone, 'pay-stub', 'grossPayPeriod', money(s.grossPayPeriod * k));
  setField(clone, 'pay-stub', 'socialSecurityWithheld', money(s.socialSecurityWithheld * k));
  setField(clone, 'pay-stub', 'medicareWithheld', money(s.medicareWithheld * k));
  setField(clone, 'pay-stub', 'ytdGrossPay', money(s.ytdGrossPay * k));
  setField(clone, 'pay-stub', 'netPay', money(s.netPay * k));
}

export const ATTACKS = [
  {
    id: 'control-clean', label: 'Clean control (no tampering)', group: 'Control', expected: 'clean',
    note: 'A genuine application. Any flag here is a false alarm.',
    apply() {},
  },
  {
    id: 'stub-naive-edit', label: 'Pay stub income raised, nothing else changed', group: 'Income', expected: 'caught',
    note: 'The stub no longer agrees with the income stated on the application.',
    apply(clone, rng) {
      setField(clone, 'pay-stub', 'grossMonthlyIncome', money(doc(clone, 'pay-stub').fields.grossMonthlyIncome * between(rng, 1.3, 1.7)));
    },
  },
  {
    id: 'stub-matches-claim', label: 'Stub and stated income raised together', group: 'Income', expected: 'caught',
    note: 'Income now matches the claim, but the tax withholding and year-to-date lines were not rescaled.',
    apply(clone, rng) {
      const k = between(rng, 1.25, 1.6);
      const s = doc(clone, 'pay-stub').fields;
      setField(clone, 'pay-stub', 'grossMonthlyIncome', money(s.grossMonthlyIncome * k));
      setField(clone, 'pay-stub', 'grossPayPeriod', money(s.grossPayPeriod * k));
      setApplication(clone, 'statedMonthlyIncome', money(clone.application.statedMonthlyIncome * k));
    },
  },
  {
    id: 'stub-ytd-edit', label: 'Year-to-date total inflated', group: 'Income', expected: 'caught',
    note: 'The year-to-date figure no longer fits this period\'s pay and the pay period number.',
    apply(clone, rng) {
      setField(clone, 'pay-stub', 'ytdGrossPay', money(doc(clone, 'pay-stub').fields.ytdGrossPay * between(rng, 1.4, 2)));
    },
  },
  {
    id: 'stub-consistent-rescale', label: 'Every stub line rescaled, bank statement untouched', group: 'Income', expected: 'caught',
    note: 'The stub is internally perfect, but the bank deposit no longer matches its net pay.',
    apply(clone, rng) {
      const k = between(rng, 1.25, 1.6);
      rescaleStub(clone, k);
      setApplication(clone, 'statedMonthlyIncome', money(clone.application.statedMonthlyIncome * k));
    },
  },
  {
    id: 'stub-and-bank-forged', label: 'Stub AND bank deposit both forged consistently', group: 'Income', expected: 'miss',
    note: 'Known limit: two documents forged to agree with each other. Needs the payroll provider or the bank to confirm.',
    apply(clone, rng) {
      const k = between(rng, 1.25, 1.6);
      rescaleStub(clone, k);
      setApplication(clone, 'statedMonthlyIncome', money(clone.application.statedMonthlyIncome * k));
      setField(clone, 'bank-statement', 'recentDepositAmount', doc(clone, 'pay-stub').fields.netPay);
    },
  },
  {
    id: 'stub-moderate-rescale', label: 'Stub rescaled by 5 to 20 percent, bank statement untouched', group: 'Income', expected: 'partial',
    note: 'Borderline by design: the bank deposit is allowed to differ by 10 percent, so smaller edits slip through and larger ones are caught.',
    apply(clone, rng) {
      const k = between(rng, 1.05, 1.2);
      rescaleStub(clone, k);
      setApplication(clone, 'statedMonthlyIncome', money(clone.application.statedMonthlyIncome * k));
    },
  },
  {
    id: 'small-shave', label: 'Small consistent inflation (2 to 4 percent)', group: 'Income', expected: 'miss',
    note: 'Known limit: an edit smaller than the tolerance the checks allow for normal variation.',
    apply(clone, rng) {
      const k = between(rng, 1.02, 1.04);
      rescaleStub(clone, k);
      setApplication(clone, 'statedMonthlyIncome', money(clone.application.statedMonthlyIncome * k));
      setField(clone, 'bank-statement', 'recentDepositAmount', doc(clone, 'pay-stub').fields.netPay);
    },
  },
  {
    id: 'stub-employer-swap', label: 'Employer on the stub replaced', group: 'Employment', expected: 'caught',
    note: 'The employer differs from the application and from the name on the bank deposit.',
    apply(clone, rng) {
      setField(clone, 'pay-stub', 'employerName', pick(rng, ['Summit Staffing LLC', 'Harbor Consulting Group', 'Apex Global Services']));
    },
  },
  {
    id: 'license-dob', label: 'Date of birth changed on the licence', group: 'Identity', expected: 'caught',
    note: 'The date of birth no longer matches the application.',
    apply(clone, rng) {
      const [m, d, y] = doc(clone, 'drivers-license').fields.dateOfBirth.split('/').map(Number);
      setField(clone, 'drivers-license', 'dateOfBirth', `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y + pick(rng, [-6, -4, 5, 7])}`);
    },
  },
  {
    id: 'license-name', label: 'Name changed on the licence', group: 'Identity', expected: 'caught',
    note: 'The name no longer matches the applicant.',
    apply(clone, rng) {
      setField(clone, 'drivers-license', 'fullName', pick(rng, ['Daniel Brooks', 'Sunil Verma', 'Caroline Fischer']));
    },
  },
  {
    id: 'license-address', label: 'Address changed on the licence', group: 'Identity', expected: 'caught',
    note: 'The address differs from the application (flagged for review, not as a hard failure).',
    apply(clone, rng) {
      setField(clone, 'drivers-license', 'address', pick(rng, ['9 Elm Street, Riverton', '300 Harbor Road, Lakeside', '41 Pine Avenue, Westfield']));
    },
  },
  {
    id: 'license-expiry-extended', label: 'Expired licence with the expiry date edited', group: 'Identity', expected: 'miss',
    note: 'Known limit: a believable new expiry date looks valid. Only the issuing agency can confirm it.',
    useBase: 'Meera Iyer',
    apply(clone, rng) {
      setField(clone, 'drivers-license', 'licenseExpiry', `04/30/${pick(rng, [2030, 2031, 2032])}`);
    },
  },
  {
    id: 'wrong-document', label: 'A different document uploaded in the required slot', group: 'Document', expected: 'caught',
    note: 'A bank statement was uploaded where a pay stub was requested.',
    apply(clone) {
      const d = doc(clone, 'bank-statement');
      d.options = { expectedDocType: 'pay-stub' };
      clone.changes.push({ doc: 'bank-statement', field: 'uploaded as', from: 'pay-stub', to: 'bank-statement' });
    },
  },
  {
    id: 'blurred-scan', label: 'Low-quality, partly illegible scan', group: 'Document', expected: 'caught',
    note: 'Extraction confidence is low, so the file goes to a person instead of being accepted.',
    apply(clone, rng) {
      const d = pick(rng, clone.docs);
      clone.changes.push({ doc: d.docType, field: 'extraction confidence', from: d.confidence, to: 0.5 });
      d.confidence = 0.5;
    },
  },
  {
    id: 'identity-reuse', label: 'Same SSN and birth date under a different name', group: 'Identity', expected: 'caught',
    note: 'A second application reuses another applicant\'s identity.',
    apply(clone, rng) {
      const original = { ...clone.application, _id: `${clone.application._id}-original`, createdAt: new Date('2026-09-01'), status: 'approved' };
      clone.others = [original];
      const alias = pick(rng, ['Karthik Menon', 'Farah Siddiqui', 'Leo Marchetti']);
      setApplication(clone, 'applicantName', alias);
      // The forger renames every document too, so only the identity lookup can give this one away.
      for (const d of clone.docs) if (d.fields.fullName != null) d.fields.fullName = alias;
      clone.changes.push({ doc: 'application', field: 'earlier application', from: null, to: `${original.applicantName} (same SSN last 4 and birth date)` });
    },
  },
];

export const ATTACKS_BY_ID = Object.fromEntries(ATTACKS.map((a) => [a.id, a]));
