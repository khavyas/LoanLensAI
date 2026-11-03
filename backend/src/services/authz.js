import { isStaff } from '../config/roles.js';

// The one place that decides who may do what (RAG plan P2-05). Deny by default: an unknown role,
// an unknown action or a missing piece of the request is a "no". Routes ask can(); the loan-file
// search takes the audiences it may read from here and nowhere else, so the two cannot disagree.

const KNOWN_ROLES = ['borrower', 'officer', 'underwriter', 'admin'];
const norm = (email) => String(email || '').trim().toLowerCase();

const ownsApplication = (principal, application) => {
  const mine = norm(principal.email);
  const theirs = norm(application?.applicantEmail);
  return Boolean(mine && theirs && mine === theirs);
};

// Each rule gets the principal ({ role, email }) and the resource (usually an application).
const RULES = {
  // Ask the assistant about an application, or rate its answers. Staff handle any application;
  // borrowers (and admins acting as an applicant) only their own.
  'application:chat': (p, application) => Boolean(application) && (isStaff(p.role) || ownsApplication(p, application)),
  // Officer co-pilot (summary, contradictions).
  'copilot:use': (p) => isStaff(p.role),
  // Policy ingestion and the RAG admin endpoints.
  'rag:admin': (p) => p.role === 'admin',
};

export class AuthzError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthzError';
  }
}

export function can(principal, action, resource) {
  if (!principal || !KNOWN_ROLES.includes(principal.role)) return false;
  const rule = RULES[action];
  return Boolean(rule && rule(principal, resource) === true);
}

// Which content audiences a role may read in the applicant's file. Staff see borrower and staff
// text; every other role, including one we do not recognise, sees borrower text only. An empty
// role is refused outright rather than guessed.
export function fileAudiences(role) {
  if (!KNOWN_ROLES.includes(role)) throw new AuthzError(`Unknown role for a file search: ${JSON.stringify(role)}`);
  return isStaff(role) ? ['borrower', 'staff'] : ['borrower'];
}

// Whether a role may read staff-only content (the review record) in a file search.
export const mayReadStaffContent = (role) => KNOWN_ROLES.includes(role) && isStaff(role);
