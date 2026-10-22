// Bank-side roles. Staff can read any application; what each may DECIDE is
// enforced in services/decisionRules.js. 'admin' manages policy documents only.
export const STAFF_ROLES = ['officer', 'underwriter'];
export const isStaff = (role) => STAFF_ROLES.includes(role);
