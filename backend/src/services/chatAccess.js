// NEW: A single, unit-testable authorization predicate for the protected chat workflow.
export function canAccessChatApplication(user, application) {
  if (!user || !application) return false;
  return user.role === 'officer' || application.applicantEmail === user.email;
}
