import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db.js';
import authRoutes from './routes/auth.js';
import applicationRoutes from './routes/applications.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'loanlens-backend' }));

app.use('/auth', authRoutes);
app.use('/applications', applicationRoutes);
app.use('/documents', documentRoutes);
app.use('/chat', chatRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 4000;
connectDb().then(() => {
  app.listen(port, () => console.log(`LoanLens backend on http://localhost:${port}`));
});
