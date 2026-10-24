// Scripted test records for the SIMULATED bureau (services/simulatedBureau.js),
// keyed by the last four digits of the SSN on the application. This is made-up
// data for demos and tests — it is NOT a real credit bureau, SSN match service
// or sanctions list. A real provider replaces the lookup, not the callers.
//
// Story borrowers (see docs/SIMULATED_VERIFICATION.md):
//   9034 Priya Nair      clean, good score
//   5567 Arjun Mehta     low score -> underwriter exception path
//   7301 Rohan Desai     SSN is on file for a DIFFERENT person -> identity fails
//   2218 Meera Iyer      clean at the bureau; her driver's license is expired
//   4410 Kavya Reddy     thin file: no credit history, no score
// Others (Jordan Rivera, Dana Whitfield) are plain clean records, and
// 0911 / 0912 exist only for tests (sanctions hit, credit freeze).
export const TEST_PERSONAS = {
  '9034': { label: 'Clean borrower', nameOnFile: 'Priya Nair', dobOnFile: '1991-11-22', credit: { status: 'scored', score: 742 }, sanctions: 'clear' },
  '5567': { label: 'Low credit score', nameOnFile: 'Arjun Mehta', dobOnFile: '1996-05-09', credit: { status: 'scored', score: 598 }, sanctions: 'clear' },
  '7301': { label: 'SSN belongs to someone else', nameOnFile: 'Vikram Nambiar', dobOnFile: '1979-02-02', credit: { status: 'scored', score: 701 }, sanctions: 'clear' },
  '2218': { label: 'Clean at the bureau (expired ID is a document problem)', nameOnFile: 'Meera Iyer', dobOnFile: '1990-09-21', credit: { status: 'scored', score: 715 }, sanctions: 'clear' },
  '4410': { label: 'Thin file, no credit history', nameOnFile: 'Kavya Reddy', dobOnFile: '2003-07-09', credit: { status: 'thin-file' }, sanctions: 'clear' },
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
