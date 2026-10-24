import { DEFAULT_PERSONA, TEST_PERSONAS } from '../config/testPersonas.js';

// SIMULATED identity, sanctions and credit checks. In production these three
// answers come from licensed providers (an SSN / ID verification network, a
// sanctions list, and a credit bureau such as Equifax, Experian or
// TransUnion, each needing a contract and the borrower's consent). Here they
// come from scripted test records so the whole flow can be demonstrated.
// Everything returned is labelled `source: 'simulated'` and shown that way in the UI.

export const PROVIDER_NAME = 'Simulated bureau (scripted test data — not a real credit bureau)';

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export function lookupPersona(ssnLast4, personas = TEST_PERSONAS) {
  return personas[String(ssnLast4 || '')] || null;
}

export function runSimulatedChecks(application, { now = new Date(), personas = TEST_PERSONAS } = {}) {
  const scripted = lookupPersona(application.ssnLast4, personas);
  const persona = scripted || DEFAULT_PERSONA;

  const nameOnFile = persona.nameOnFile || application.applicantName;
  const nameOk = norm(application.applicantName) === norm(nameOnFile);
  const dobOnFile = persona.dobOnFile || day(application.dateOfBirth);
  const dobOk = !application.dateOfBirth || day(application.dateOfBirth) === dobOnFile;
  const verified = nameOk && dobOk;

  const identity = verified
    ? { status: 'verified', detail: 'Name and date of birth match the record held for this SSN.' }
    : {
        status: 'failed',
        // Real services answer match / no match; they never disclose whose record it is.
        detail: 'The name and date of birth do not match the record held for this SSN. This can indicate a mistyped SSN or a stolen or synthetic identity.',
      };

  const sanctions =
    persona.sanctions === 'potential-match'
      ? { status: 'potential-match', detail: 'The name resembles an entry on a sanctions list. Compliance must review before any approval.' }
      : { status: 'clear', detail: 'No sanctions-list match for this name.' };

  let credit;
  if (!verified) {
    credit = { status: 'not-run', detail: 'Skipped: a credit report is not pulled for an identity that could not be verified.' };
  } else if (persona.credit.status === 'scored') {
    credit = { status: 'scored', score: persona.credit.score, detail: `Credit score ${persona.credit.score}.` };
  } else if (persona.credit.status === 'frozen') {
    credit = { status: 'frozen', detail: 'A credit freeze or fraud alert is on file, so no score can be returned. Ask the borrower to lift it temporarily.' };
  } else {
    credit = { status: 'thin-file', detail: 'No credit history on file (a "thin file"), so no score exists. Review other evidence, or enter a score by hand from another report.' };
  }

  return {
    source: 'simulated',
    provider: PROVIDER_NAME,
    scenario: persona.label,
    scripted: Boolean(scripted),
    runAt: now.toISOString(),
    identity,
    sanctions,
    credit,
  };
}
