import { isStaff } from '../config/roles.js';

// Borrowers and admins can chat only about their own application. Staff
// (officers, underwriters) handle applications across borrowers and may chat
// about any application.
export function canAccessChatApplication(user, application) {
  if (!user || !application) return false;
  if (!['admin', 'officer', 'underwriter', 'borrower'].includes(user.role)) return false;
  if (isStaff(user.role)) return true;
  const userEmail = String(user.email || '').trim().toLowerCase();
  const ownerEmail = String(application.applicantEmail || '').trim().toLowerCase();
  return Boolean(userEmail && ownerEmail && userEmail === ownerEmail);
}
