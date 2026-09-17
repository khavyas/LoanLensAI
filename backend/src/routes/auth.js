import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = Router();

function issueSession(user) {
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  return { token, user: { name: user.name, email: user.email, role: user.role } };
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json(issueSession(user));
  } catch (err) {
    next(err);
  }
});

// Self-registration — a POC/demo convenience so teammates can spin up their
// own test accounts without a DB console. No email verification: this is a
// synthetic-data demo environment, not a real bank onboarding flow.
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (!['officer', 'borrower'].includes(role)) {
      return res.status(400).json({ error: "role must be 'officer' or 'borrower'" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash, role });
    res.status(201).json(issueSession(user));
  } catch (err) {
    next(err);
  }
});

export default router;
