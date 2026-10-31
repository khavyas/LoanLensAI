// "Monthly income: $4,533 -> $7,200". The server sends each change as
// { label, kind, from, to }; this is the one place that turns it into text, used by the
// borrower's confirmation and by the staff review history.
const show = (kind, value) => {
  if (value == null || value === '') return 'blank';
  if (kind === 'money') return `$${Number(value).toLocaleString('en-US')}`;
  if (kind === 'months') return `${value} months`;
  return String(value);
};

export const formatChange = (c) => `${c.label}: ${show(c.kind, c.from)} → ${show(c.kind, c.to)}`;
