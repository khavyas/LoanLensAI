// SCRIPTED case files for the three jury-demo borrowers. Like config/testPersonas.js this is made-up data:
// there is no real bank-statement, payroll or background feed behind it, and the courtroom screen marks every
// exhibit from here as scripted demo data. A real integration would replace this lookup, not the callers.
//
// A case is matched on name AND the SSN last four of the scripted persona, so a real applicant who happens
// to share a name never receives it. Wording rules: describe evidence, never say whether the loan should
// be approved or declined (the courtroom's own verdict filter applies to model text; these lines follow
// the same rule by hand and a test checks them).

const exhibit = (label, doc, section, snippet) => ({ label, kind: 'exhibit', doc, section, snippet });

const MEERA_X1 = exhibit('X1', 'Bank statement analysis', 'Spending pattern, last 30 days',
  'Income $5,400. Food delivery: 41 orders (Swiggy 23, Zomato 18), $1,099. Amazon: 17 orders, $734. Mall and clothing: 6 visits, $1,128. Discretionary total $2,961, which is 55% of income. Month-end balance across the last three statements: $162, $97 and $231.');
const MEERA_X2 = exhibit('X2', 'Bank statement analysis', 'Obligations',
  'Rent, utilities and phone cleared on their due date in all three statements. No overdrafts and no returned payments.');

const JORDAN_X1 = exhibit('X1', 'Payroll credits traced to employers', 'Last 12 months',
  'Ridgeway Freight, Nov 2025 to Jan 2026, $3,900 a month. Harbor Parcel Services, Feb to Jun 2026, $4,300 a month. Brightline Logistics, Jul 2026 to now, $4,200 a month. Two gaps with no payroll credit: three weeks (Jan to Feb) and two weeks (Jun to Jul).');
const JORDAN_X2 = exhibit('X2', 'SSN employment trace (simulated third party)', 'Wage reports, last 12 months',
  'Three employers reported wages under this SSN in the last 12 months. All three match the payroll credits in X1.');
const JORDAN_X3 = exhibit('X3', 'Application record', 'Stated income',
  'Stated income $5,000 a month. Most recent payroll credit $4,200 a month.');

const PRIYA_X1 = exhibit('X1', 'Background screening (simulated)', 'Police records',
  'One First Information Report (FIR) is on record for this name. An FIR is a complaint record, not a conviction. The screening does not return its details.');
const PRIYA_X2 = exhibit('X2', 'Background screening (simulated)', 'Tax and social responsibility',
  'No filed income-tax returns and no tax payments found in any record searched, for the last three years.');
const PRIYA_X3 = exhibit('X3', 'Pay stub', 'Tax withheld',
  'Gross pay $3,323.08 and net pay $2,454.10 for the pay period, so $868.98 was withheld by the employer.');

export const DEMO_CASES = [
  {
    name: 'Meera Iyer',
    ssnLast4: '2218',
    reason: 'spending pattern on the bank statement',
    against: [
      {
        text: 'Exhibit X1, Your Honour: 41 food-delivery orders in 30 days (Swiggy 23, Zomato 18), 17 Amazon boxes and 6 trips to the mall. The statement reads like a loyalty-programme leaderboard.',
        cites: [MEERA_X1],
        reply: { text: 'Cross-examined: yes, but look at what is missing. No overdrafts, no returned payments, rent on time. She spends her own money and pays her bills first.', cites: [MEERA_X2] },
      },
      {
        text: 'Clothes and mall spending came to $1,128 this month and recurs in every statement. Discretionary spending is 55% of income and only $162 is left at month end, a savings rate of 3%.',
        cites: [MEERA_X1],
        reply: { text: 'Her pay stub confirms the income. A thin buffer is a risk worth watching, not a missed payment, and there is none on this record.', cites: [MEERA_X2] },
      },
    ],
    for: [
      {
        text: 'Objection! Ordering dinner is not a crime. Rent, utilities and phone cleared on time in all three statements, with no overdrafts and no returned payments.',
        cites: [MEERA_X2],
        reply: { text: 'Noted, Your Honour. But the buffer is $162. One surprise bill and the instalment is what bounces.', cites: [MEERA_X1] },
      },
    ],
  },
  {
    name: 'Jordan Rivera',
    ssnLast4: '4821',
    reason: 'income stability across employers',
    against: [
      {
        text: 'Three employers in twelve months, Your Honour. Ridgeway, then Harbor, then Brightline. He has changed jobs more often than most people change phone plans.',
        cites: [JORDAN_X1, JORDAN_X2],
        reply: { text: 'Pay stayed in a narrow band: $3,900, then $4,300, then $4,200. He was never out of work for more than three weeks, and the SSN trace confirms every employer is real.', cites: [JORDAN_X1, JORDAN_X2] },
      },
      {
        text: 'This loan runs for years and his longest job so far lasted five months. How do we know he will still be earning in a year, and who stands behind that income?',
        cites: [JORDAN_X1],
        reply: { text: 'Nobody can guarantee income for anyone. The record shows a working borrower with a credit score of 705 and no missed payments.', cites: [JORDAN_X2] },
      },
      {
        text: 'Even his current income needs explaining: the application says $5,000 a month and the latest payroll credit is $4,200.',
        cites: [JORDAN_X3],
      },
    ],
    for: [
      {
        text: 'Order! The man works. Three employers, all confirmed by the SSN trace, with pay between $3,900 and $4,300 and never more than three weeks between jobs.',
        cites: [JORDAN_X1, JORDAN_X2],
        reply: { text: 'Two gaps in one year, Your Honour, and a loan that does not pause when the paycheque does.', cites: [JORDAN_X1] },
      },
    ],
  },
  {
    name: 'Priya Nair',
    ssnLast4: '9034',
    reason: 'background screening did not pass',
    against: [
      {
        text: 'Her paperwork is spotless, Your Honour. Her background is another matter: one FIR on record under her name.',
        cites: [PRIYA_X1],
        reply: { text: 'An FIR is a complaint, not a conviction, and nothing on this record says otherwise. A complaint is a reason to ask questions, not a finding.', cites: [PRIYA_X1] },
      },
      {
        text: 'And on tax and social responsibility: no filed returns and no tax payments in any record searched, in three years. The bank is being asked to trust her with $15,000.',
        cites: [PRIYA_X2],
        reply: { text: 'Her pay stub shows $868.98 withheld by her employer in one pay period. Tax is being paid on her behalf, and the gap may be in the records searched, not in her conduct.', cites: [PRIYA_X3] },
      },
    ],
    for: [
      {
        text: 'Every document she supplied is genuine and agrees with the application, and her credit score is 742.',
        cites: [PRIYA_X3],
        reply: { text: 'Documents prove who she is and what she earns, Your Honour. They do not answer what the background search found.', cites: [PRIYA_X1] },
      },
    ],
  },
];

export function demoCaseFor(application) {
  if (!application) return null;
  return DEMO_CASES.find((c) => c.name === application.applicantName && c.ssnLast4 === String(application.ssnLast4 || '')) || null;
}
