import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb } from '../config/db.js';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Document from '../models/Document.js';

const REQUIRED_DOCS = ['pay-stub', 'drivers-license', 'bank-statement'];
const SMB_REQUIRED_DOCS = [
  'business-tax-return',
  'personal-financial-statement',
  'business-license',
  'ownership-disclosure',
];

async function run() {
  await connectDb();
  await Promise.all([User.deleteMany({}), Application.deleteMany({}), Document.deleteMany({})]);

  const passwordHash = await bcrypt.hash('demo1234', 10);
  await User.create([
    { email: 'officer@loanlens.demo', passwordHash, name: 'Olivia Officer', role: 'officer' },
    { email: 'borrower@loanlens.demo', passwordHash, name: 'Jordan Rivera', role: 'borrower' },
  ]);

  await Application.create([
    {
      applicantName: 'Dana Whitfield',
      applicantEmail: 'dana.whitfield@example.demo',
      productType: 'small-business-loan',
      businessName: 'Whitfield & Co. Bakery LLC',
      statedAnnualBusinessRevenue: 340000, // planted mismatch: tax return will show $275,400
      address: '14 Crestline Rd, Springfield',
      ssnLast4: '6672',
      requestedAmount: 85000,
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
      applicantName: 'Marcus Webb',
      applicantEmail: 'marcus.webb@example.demo',
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

  console.log('Seeded 2 users and 4 applications.');
  console.log('Logins: officer@loanlens.demo / demo1234  ·  borrower@loanlens.demo / demo1234');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
