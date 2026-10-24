import Application from '../models/Application.js';

// Duplicate / reused identity detection across applications.
//
// The match key is the SSN's last four digits PLUS the date of birth. That is
// a PROXY: last-4 alone collides constantly, last-4 + date of birth rarely
// does by chance. Production should compare a keyed hash of the full SSN
// instead (tracked in the task list), which also removes the proxy's blind
// spots. Pure function below; `duplicateMatchesFor` does the lookup.
//
//   different-name    an EARLIER application used the same SSN last-4 and date
//                     of birth under another name -> possible identity reuse
//                     (stolen or synthetic identity). Any status counts.
//   same-person-open  the same person has another application that is still
//                     open -> policy allows one open application at a time.
//
// Only the LATER application is flagged. The earlier record is not penalised
// for something done after it, so a genuine borrower is never blocked by an
// impostor who copied their details.

const OPEN_STATUSES = ['submitted', 'needs-review', 'referred'];

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const dayOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function isEarlier(other, application) {
  const a = other.createdAt ? new Date(other.createdAt).getTime() : null;
  const b = application.createdAt ? new Date(application.createdAt).getTime() : null;
  if (a != null && b != null && a !== b) return a < b;
  return String(other._id) < String(application._id);
}

export function findDuplicateMatches(application, others = []) {
  if (!application.ssnLast4 || !application.dateOfBirth) return [];
  const dob = dayOf(application.dateOfBirth);
  const matches = [];
  for (const other of others) {
    if (String(other._id) === String(application._id)) continue;
    if (other.ssnLast4 !== application.ssnLast4) continue;
    if (dayOf(other.dateOfBirth) !== dob) continue;
    if (!isEarlier(other, application)) continue;
    const sameName = norm(other.applicantName) === norm(application.applicantName);
    if (!sameName) {
      matches.push({ id: String(other._id), applicantName: other.applicantName, status: other.status, kind: 'different-name' });
    } else if (OPEN_STATUSES.includes(other.status)) {
      matches.push({ id: String(other._id), applicantName: other.applicantName, status: other.status, kind: 'same-person-open' });
    }
  }
  return matches;
}

export async function duplicateMatchesFor(application) {
  const plain = typeof application.toObject === 'function' ? application.toObject() : application;
  if (!plain.ssnLast4) return [];
  const others = await Application.find({ ssnLast4: plain.ssnLast4, _id: { $ne: plain._id } })
    .select('applicantName ssnLast4 dateOfBirth status createdAt')
    .lean();
  return findDuplicateMatches(plain, others);
}
