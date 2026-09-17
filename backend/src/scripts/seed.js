import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { connectDb } from '../config/db.js';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import { REQUIRED_DOCS_BY_PRODUCT } from '../config/requiredDocs.js';
import { mockClassifyAndExtract } from '../services/mockFixtures.js';
import { verifyDocument } from '../services/verification.js';

const REQUIRED_DOCS = REQUIRED_DOCS_BY_PRODUCT['auto-loan'];
const SMB_REQUIRED_DOCS = REQUIRED_DOCS_BY_PRODUCT['small-business-loan'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../data/seed/documents');

// Priya Nair is pre-seeded with all three required documents already
// uploaded and verified clean — a "one perfect application" reference to
// compare everything else against, rather than everyone having to manually
// upload the right files first to see what a fully-passing application
// looks like. Reuses the exact same fixture data as MOCK_AI mode
// (mockFixtures.js), so this is guaranteed consistent with what a live
// upload of these same files would produce.
const PRIYA_FILES = [
  'priya-nair-pay-stub.png',
  'priya-nair-drivers-license.png',
  'priya-nair-bank-statement.png',
];

async function seedPriyaDocuments(priyaApp) {
  for (const fileName of PRIYA_FILES) {
    const extracted = mockClassifyAndExtract(fileName);
    const verification = verifyDocument(priyaApp, extracted);
    await Document.create({
      applicationId: priyaApp._id,
      fileName,
      docType: extracted.docType,
      fileData: fs.readFileSync(path.join(DOCS_DIR, fileName)),
      mimeType: 'image/png',
      extractedFields: extracted.fields,
      confidence: extracted.confidence,
      verification,
      status: 'current',
    });
  }
}

async function run() {
  await connectDb();
  await Promise.all([User.deleteMany({}), Application.deleteMany({}), Document.deleteMany({})]);

  const passwordHash = await bcrypt.hash('demo1234', 10);
  await User.create([
    { email: 'officer@loanlens.demo', passwordHash, name: 'Olivia Officer', role: 'officer' },
    { email: 'borrower@loanlens.demo', passwordHash, name: 'Jordan Rivera', role: 'borrower' },
    { email: 'dana.whitfield@example.demo', passwordHash, name: 'Dana Whitfield', role: 'borrower' },
    { email: 'priya.nair@example.demo', passwordHash, name: 'Priya Nair', role: 'borrower' },
    { email: 'arjun.mehta@example.demo', passwordHash, name: 'Arjun Mehta', role: 'borrower' },
  ]);

  const apps = await Application.create([
    {
      applicantName: 'Dana Whitfield',
      applicantEmail: 'dana.whitfield@example.demo',
      productType: 'small-business-loan',
      businessName: 'Whitfield & Co. Bakery LLC',
      statedAnnualBusinessRevenue: 340000, // planted mismatch: tax return will show $275,400
      address: '14 Crestline Rd, Springfield',
      ssnLast4: '6672',
      // Planted affordability flag: 30% of documented revenue ($275,400 on the
      // tax return) caps this at ~$82,620 — $110,000 is a clear, demo-able breach.
      requestedAmount: 110000,
      requiredDocTypes: SMB_REQUIRED_DOCS,
      status: 'submitted',
    },
    {
      applicantName: 'Jordan Rivera',
      applicantEmail: 'borrower@loanlens.demo',
      productType: 'auto-loan',
      statedMonthlyIncome: 5000, // planted mismatch: demo pay stub will show 4200
      employerName: 'Brightline Logistics',
      address: '412 Maple Court, Springfield',
      ssnLast4: '4821',
      requestedAmount: 28000,
      requiredDocTypes: REQUIRED_DOCS,
    },
    {
      applicantName: 'Priya Nair',
      applicantEmail: 'priya.nair@example.demo',
      productType: 'personal-loan',
      statedMonthlyIncome: 7200,
      employerName: 'Cedar Health Systems',
      address: '88 Lakeview Drive, Springfield',
      ssnLast4: '9034',
      requestedAmount: 15000,
      requiredDocTypes: REQUIRED_DOCS,
      status: 'submitted',
    },
    {
      applicantName: 'Arjun Mehta',
      applicantEmail: 'arjun.mehta@example.demo',
      productType: 'auto-loan',
      statedMonthlyIncome: 3900,
      employerName: 'Ironwood Manufacturing',
      address: '17 Birch Street, Springfield',
      ssnLast4: '5567',
      requestedAmount: 19500,
      requiredDocTypes: REQUIRED_DOCS,
      status: 'submitted',
    },
  ]);

  const priyaApp = apps.find((a) => a.applicantName === 'Priya Nair');
  await seedPriyaDocuments(priyaApp);

  console.log('Seeded 5 users and 4 applications (Priya Nair pre-loaded with 3 clean, verified documents).');
  console.log(
    'Logins: officer@loanlens.demo / demo1234  ·  borrower@loanlens.demo / demo1234 (Jordan Rivera)  ·  dana.whitfield@example.demo / demo1234  ·  priya.nair@example.demo / demo1234  ·  arjun.mehta@example.demo / demo1234'
  );
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
