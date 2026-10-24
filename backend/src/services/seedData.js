import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { REQUIRED_DOCS_BY_PRODUCT } from '../config/requiredDocs.js';
import { mockClassifyAndExtract } from './mockFixtures.js';
import { openExceptions, verifyDocument } from './verification.js';

// The single definition of the demo data, shared by `npm run seed` and the
// /admin/reset route (previously each carried its own copy).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../data/seed/documents');

export const DEMO_PASSWORD = 'demo1234';

const CONSUMER_DOCS = REQUIRED_DOCS_BY_PRODUCT['auto-loan'];
const SMB_DOCS = REQUIRED_DOCS_BY_PRODUCT['small-business-loan'];

export const USERS = [
  { email: 'officer@loanlens.demo', name: 'Olivia Officer', role: 'officer' },
  // Approves policy exceptions on files a loan officer refers; not self-registrable.
  { email: 'underwriter@loanlens.demo', name: 'Uma Underwriter', role: 'underwriter' },
  { email: 'borrower@loanlens.demo', name: 'Jordan Rivera', role: 'borrower' },
  { email: 'dana.whitfield@example.demo', name: 'Dana Whitfield', role: 'borrower' },
  { email: 'priya.nair@example.demo', name: 'Priya Nair', role: 'borrower' },
  { email: 'arjun.mehta@example.demo', name: 'Arjun Mehta', role: 'borrower' },
  { email: 'rohan.desai@example.demo', name: 'Rohan Desai', role: 'borrower' },
  { email: 'meera.iyer@example.demo', name: 'Meera Iyer', role: 'borrower' },
  { email: 'kavya.reddy@example.demo', name: 'Kavya Reddy', role: 'borrower' },
  { email: 'anil.kapoor@example.demo', name: 'Anil Kapoor', role: 'borrower' },
  { email: 'lakshmi.pillai@example.demo', name: 'Lakshmi Pillai', role: 'borrower' },
];

const personal = (extra) => ({
  productType: 'personal-loan',
  repaymentTermMonths: 36,
  requiredDocTypes: CONSUMER_DOCS,
  status: 'submitted',
  consentAcceptedAt: new Date(),
  ...extra,
});

export const APPLICATIONS = [
  {
    applicantName: 'Dana Whitfield',
    applicantEmail: 'dana.whitfield@example.demo',
    productType: 'small-business-loan',
    businessName: 'Whitfield & Co. Bakery LLC',
    statedAnnualBusinessRevenue: 340000, // planted mismatch: tax return will show $275,400
    address: '14 Crestline Rd, Springfield',
    residencyStatus: 'us-citizen',
    ssnLast4: '6672',
    // Planted affordability flag: 30% of documented revenue ($275,400 on the
    // tax return) caps this at ~$82,620 — $110,000 is a clear, demo-able breach.
    requestedAmount: 110000,
    requiredDocTypes: SMB_DOCS,
    status: 'submitted',
  },
  {
    applicantName: 'Jordan Rivera',
    applicantEmail: 'borrower@loanlens.demo',
    productType: 'auto-loan',
    statedMonthlyIncome: 5000, // planted mismatch: demo pay stub will show 4200
    employerName: 'Brightline Logistics',
    address: '412 Maple Court, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('1994-03-12'),
    ssnLast4: '4821',
    requestedAmount: 28000,
    requiredDocTypes: CONSUMER_DOCS,
    status: 'submitted',
  },
  // ---- The identity / credit story borrowers (docs/SIMULATED_VERIFICATION.md) ----
  // Priya: clean everywhere.
  personal({
    applicantName: 'Priya Nair',
    applicantEmail: 'priya.nair@example.demo',
    statedMonthlyIncome: 7200,
    employerName: 'Cedar Health Systems',
    address: '88 Lakeview Drive, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('1991-11-22'),
    ssnLast4: '9034',
    requestedAmount: 15000,
  }),
  // Arjun: documents fine (one soft employer warning), credit score 598 at the bureau.
  {
    applicantName: 'Arjun Mehta',
    applicantEmail: 'arjun.mehta@example.demo',
    productType: 'auto-loan',
    repaymentTermMonths: 60,
    statedMonthlyIncome: 3900,
    employerName: 'Ironwood Manufacturing',
    address: '17 Birch Street, Springfield',
    residencyStatus: 'permanent-resident',
    dateOfBirth: new Date('1996-05-09'),
    ssnLast4: '5567',
    requestedAmount: 19500,
    requiredDocTypes: CONSUMER_DOCS,
    status: 'submitted',
    consentAcceptedAt: new Date(),
  },
  // Rohan: documents fine, but his SSN is on file for a different person.
  personal({
    applicantName: 'Rohan Desai',
    applicantEmail: 'rohan.desai@example.demo',
    statedMonthlyIncome: 6000,
    employerName: 'Northgate Logistics',
    address: '23 Orchard Lane, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('1988-03-14'),
    ssnLast4: '7301',
    requestedAmount: 12000,
  }),
  // Meera: bureau clean, but her driver's license expired on 04/30/2026.
  personal({
    applicantName: 'Meera Iyer',
    applicantEmail: 'meera.iyer@example.demo',
    statedMonthlyIncome: 5400,
    employerName: 'Brookfield Dental Group',
    address: '9 Willow Court, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('1990-09-21'),
    ssnLast4: '2218',
    requestedAmount: 10000,
  }),
  // Kavya: documents fine, but she has no credit history (thin file).
  personal({
    applicantName: 'Kavya Reddy',
    applicantEmail: 'kavya.reddy@example.demo',
    statedMonthlyIncome: 3200,
    employerName: 'Greenleaf Pharmacy',
    address: '61 Sunrise Avenue, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('2003-07-09'),
    ssnLast4: '4410',
    requestedAmount: 5000,
  }),
  // Anil: reuses Priya Nair's SSN last-4 and date of birth under his own name.
  // Created AFTER Priya, so only his file is flagged (the earlier record is not penalised).
  personal({
    applicantName: 'Anil Kapoor',
    applicantEmail: 'anil.kapoor@example.demo',
    statedMonthlyIncome: 5800,
    employerName: 'Summit Realty Group',
    address: '5 Maple Terrace, Springfield',
    residencyStatus: 'us-citizen',
    dateOfBirth: new Date('1991-11-22'),
    ssnLast4: '9034',
    requestedAmount: 9000,
  }),
  // Lakshmi: everything clean, but her visa ends 2028-06-30, before a 36-month loan
  // from today does -> the residency rule is unmet and an underwriter can approve with a condition.
  personal({
    applicantName: 'Lakshmi Pillai',
    applicantEmail: 'lakshmi.pillai@example.demo',
    statedMonthlyIncome: 8200,
    employerName: 'Orbit Software Labs',
    address: '38 Riverside Drive, Springfield',
    residencyStatus: 'visa-holder',
    visaValidUntil: new Date('2028-06-30'),
    dateOfBirth: new Date('1992-04-18'),
    ssnLast4: '6150',
    requestedAmount: 18000,
  }),
];

// Borrowers whose documents are pre-uploaded so a story can be shown without
// uploading anything by hand. Jordan and Dana are left empty on purpose: their
// demo is the live upload (see DEMO_SCRIPT.md).
export const DOCUMENT_FILES = {
  'Priya Nair': ['priya-nair-pay-stub.png', 'priya-nair-drivers-license.png', 'priya-nair-bank-statement.png'],
  'Arjun Mehta': ['arjun-mehta-pay-stub.png', 'arjun-mehta-drivers-license.png', 'arjun-mehta-bank-statement.png'],
  'Rohan Desai': ['rohan-desai-pay-stub.png', 'rohan-desai-drivers-license.png', 'rohan-desai-bank-statement.png'],
  'Meera Iyer': ['meera-iyer-pay-stub.png', 'meera-iyer-drivers-license.png', 'meera-iyer-bank-statement.png'],
  'Kavya Reddy': ['kavya-reddy-pay-stub.png', 'kavya-reddy-drivers-license.png', 'kavya-reddy-bank-statement.png'],
  'Anil Kapoor': ['anil-kapoor-pay-stub.png', 'anil-kapoor-drivers-license.png', 'anil-kapoor-bank-statement.png'],
  'Lakshmi Pillai': ['lakshmi-pillai-pay-stub.png', 'lakshmi-pillai-drivers-license.png', 'lakshmi-pillai-bank-statement.png'],
};

// Same fixture data as MOCK_AI mode, run through the real verifyDocument(), so
// a pre-loaded document is exactly what a live upload of that file produces.
async function seedDocuments(application, files) {
  const created = [];
  for (const fileName of files) {
    const extracted = mockClassifyAndExtract(fileName);
    const verification = verifyDocument(application, extracted);
    created.push(
      await Document.create({
        applicationId: application._id,
        fileName,
        docType: extracted.docType,
        fileData: fs.readFileSync(path.join(DOCS_DIR, fileName)),
        mimeType: 'image/png',
        extractedFields: extracted.fields,
        confidence: extracted.confidence,
        extractionSource: 'mock',
        verification,
        status: 'current',
      })
    );
  }
  // An application with an open flag starts in "Needs Review", as after a live upload.
  if (openExceptions(application, created).length) {
    application.status = 'needs-review';
    await application.save();
  }
}

export async function seedAll() {
  // Administrator accounts are created by hand (`npm run admin:create`) and are never part
  // of the demo data, so a reset must not delete them — otherwise every reset locks the
  // administrator out.
  await Promise.all([User.deleteMany({ role: { $ne: 'admin' } }), Application.deleteMany({}), Document.deleteMany({})]);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.create(USERS.map((u) => ({ ...u, passwordHash })));
  // One at a time, in order: the duplicate-identity check treats the earlier
  // application as the original, so creation order must be the list order.
  const apps = [];
  for (const a of APPLICATIONS) {
    apps.push(
      await Application.create({
        ...a,
        reviewHistory: [{ at: new Date(), actor: { name: a.applicantName, email: a.applicantEmail, role: 'borrower' }, action: 'submitted', note: '' }],
      })
    );
  }
  for (const app of apps) {
    if (DOCUMENT_FILES[app.applicantName]) await seedDocuments(app, DOCUMENT_FILES[app.applicantName]);
  }
  return { users: USERS.length, applications: apps.length, preloadedBorrowers: Object.keys(DOCUMENT_FILES) };
}
