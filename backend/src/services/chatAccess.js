// Borrowers and admins can chat only about their own application. Officers
// handle applications across borrowers and may chat about any application.
export function canAccessChatApplication(user, application) {
  if (!user || !application) return false;
  if (!['admin', 'officer', 'borrower'].includes(user.role)) return false;
  if (user.role === 'officer') return true;
  const userEmail = String(user.email || '').trim().toLowerCase();
  const ownerEmail = String(application.applicantEmail || '').trim().toLowerCase();
  return Boolean(userEmail && ownerEmail && userEmail === ownerEmail);
}
