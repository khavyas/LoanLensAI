// Design tokens — modeled on modern US fintech/lending UI (deep navy brand,
// single action blue, tinted status pills, cool-gray canvas).
export const colors = {
  primary: '#0A2540', // brand navy (headers, user chat bubble)
  accent: '#155EEF', // action blue (buttons, active tab)
  bg: '#F7F9FC',
  card: '#FFFFFF',
  text: '#101828',
  muted: '#667085',
  faint: '#98A2B3',
  border: '#E4E9F0',
  success: '#027A48',
  successBg: '#ECFDF3',
  warning: '#B54708',
  warningBg: '#FFFAEB',
  danger: '#B42318',
  dangerBg: '#FEF3F2',
  info: '#175CD3',
  infoBg: '#EFF8FF',
  neutral: '#475467',
  neutralBg: '#F2F4F7',
};

export const shadow = {
  shadowColor: '#101828',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

// "pay-stub" -> "Pay Stub"
export function labelize(s) {
  return (s || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const STATUS_TONE = {
  submitted: 'info',
  'needs-review': 'warning',
  approved: 'success',
  rejected: 'danger',
  draft: 'neutral',
};
