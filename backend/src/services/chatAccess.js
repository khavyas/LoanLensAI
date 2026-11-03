import { can } from './authz.js';

// Borrowers and admins can chat only about their own application. Staff
// (officers, underwriters) handle applications across borrowers and may chat
// about any application. The rule itself lives in authz.js.
export const canAccessChatApplication = (user, application) => can(user, 'application:chat', application);
