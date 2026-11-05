// Scripted test records for the SIMULATED bureau (services/simulatedBureau.js),
// keyed by the last four digits of the SSN on the application. This is made-up
// data for demos and tests — it is NOT a real credit bureau, SSN match service
// or sanctions list. A real provider replaces the lookup, not the callers.
//
// Story borrowers (see docs/SIMULATED_VERIFICATION.md):
//   9034 Priya Nair      clean documents and score; the BACKGROUND screening fails (one FIR on
//                        record, no tax history found), so her story is a paperwork-perfect file
//                        that still cannot be approved
//   5567 Arjun Mehta     low score -> underwriter exception path
//   7301 Rohan Desai     SSN is on file for a DIFFERENT person -> identity fails
//   2218 Meera Iyer      clean at the bureau; her driver's license is expired
//   4410 Kavya Reddy     thin file: no credit history, no score
//   9034 (again) Anil Kapoor reuses Priya's SSN/date of birth: the bureau says the
//                       SSN belongs to Priya, and the duplicate check flags it too
//   6150 Lakshmi Pillai  clean; the visa-holder residency rule is the story, not the bureau
// Others (Jordan Rivera, Dana Whitfield) are plain clean records, and
// 0911 / 0912 exist only for tests (sanctions hit, credit freeze).
export const TEST_PERSONAS = {
  '9034': {
    label: 'Background screening failed (scripted: one FIR on record, no tax history found)',
    nameOnFile: 'Priya Nair', dobOnFile: '1991-11-22', credit: { status: 'scored', score: 742 },
    sanctions: 'adverse-record',
    adverse: {
      detail: 'Background screening did not pass. One First Information Report (FIR) is on record for this name, and no tax or social-contribution history was found. Compliance must review before any approval.',
      findings: [
        { label: 'Police records', text: 'One First Information Report (FIR) is on record for this name. An FIR is a complaint record, not a conviction.' },
        { label: 'Tax and social responsibility', text: 'No filed income-tax returns and no tax payments were found in any record searched for the last three years.' },
      ],
    },
  },
  '5567': { label: 'Low credit score', nameOnFile: 'Arjun Mehta', dobOnFile: '1996-05-09', credit: { status: 'scored', score: 598 }, sanctions: 'clear' },
  '7301': { label: 'SSN belongs to someone else', nameOnFile: 'Vikram Nambiar', dobOnFile: '1979-02-02', credit: { status: 'scored', score: 701 }, sanctions: 'clear' },
  '2218': { label: 'Clean at the bureau (expired ID is a document problem)', nameOnFile: 'Meera Iyer', dobOnFile: '1990-09-21', credit: { status: 'scored', score: 715 }, sanctions: 'clear' },
  '4410': { label: 'Thin file, no credit history', nameOnFile: 'Kavya Reddy', dobOnFile: '2003-07-09', credit: { status: 'thin-file' }, sanctions: 'clear' },
  // Demo-only applicant (not seeded): created live in the jury demo, see docs/DEMO_SCRIPT.md.
  '8842': { label: 'Clean borrower (live demo applicant)', nameOnFile: 'Nisha Rao', dobOnFile: '1993-02-15', credit: { status: 'scored', score: 720 }, sanctions: 'clear' },
  '6150': { label: 'Clean at the bureau (visa ends before the loan: a residency exception)', nameOnFile: 'Lakshmi Pillai', dobOnFile: '1992-04-18', credit: { status: 'scored', score: 730 }, sanctions: 'clear' },
  '4821': { label: 'Clean borrower', nameOnFile: 'Jordan Rivera', dobOnFile: '1994-03-12', credit: { status: 'scored', score: 705 }, sanctions: 'clear' },
  '6672': { label: 'Clean borrower', nameOnFile: 'Dana Whitfield', dobOnFile: null, credit: { status: 'scored', score: 688 }, sanctions: 'clear' },
  // Test-only records
  '0911': { label: 'Name matches a sanctions-list entry', nameOnFile: null, dobOnFile: null, credit: { status: 'scored', score: 690 }, sanctions: 'potential-match' },
  '0912': { label: 'Credit freeze on file', nameOnFile: null, dobOnFile: null, credit: { status: 'frozen' }, sanctions: 'clear' },
};

// Any SSN without a scripted record (for example a teammate's new test
// account) behaves like a clean borrower, so nobody is blocked by missing test data.
export const DEFAULT_PERSONA = {
  label: 'No scripted test record for this SSN — treated as a clean borrower',
  nameOnFile: null,
  dobOnFile: null,
  credit: { status: 'scored', score: 700 },
  sanctions: 'clear',
};
