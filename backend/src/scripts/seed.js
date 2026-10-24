import 'dotenv/config';
import { connectDb } from '../config/db.js';
import { DEMO_PASSWORD, seedAll } from '../services/seedData.js';

async function run() {
  await connectDb();
  const result = await seedAll();
  console.log(`Seeded ${result.users} users and ${result.applications} applications.`);
  console.log(`Documents pre-loaded for: ${result.preloadedBorrowers.join(', ')}.`);
  console.log(`Logins (password ${DEMO_PASSWORD} for every account): officer@loanlens.demo, underwriter@loanlens.demo, borrower@loanlens.demo (Jordan Rivera), dana.whitfield@, priya.nair@, arjun.mehta@, rohan.desai@, meera.iyer@, kavya.reddy@ example.demo`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
