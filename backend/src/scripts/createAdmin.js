import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import User from '../models/User.js';
import { connectDb } from '../config/db.js';

function readHidden(prompt) {
  if (!input.isTTY || !input.setRawMode) return Promise.reject(new Error('Run this command in an interactive terminal.'));
  return new Promise((resolve, reject) => {
    output.write(prompt);
    let value = '';
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      output.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        value += char;
        output.write('*');
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

const prompts = createInterface({ input, output });
try {
  const name = (await prompts.question('Administrator name: ')).trim();
  const email = (await prompts.question('Administrator email: ')).trim().toLowerCase();
  prompts.close();
  const password = await readHidden('Password (minimum 12 characters): ');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a name and valid email address.');
  if (password.length < 12) throw new Error('Administrator password must be at least 12 characters.');

  await connectDb();
  if (await User.exists({ email })) throw new Error('An account with this email already exists. Choose a new email; this script never changes another role.');
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name, email, passwordHash, role: 'admin' });
  console.log('Administrator account created. Sign in using the Administrator option in LoanLens.');
} catch (error) {
  console.error('[admin:create] ' + error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
