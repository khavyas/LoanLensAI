import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';

process.env.SETUP_SECRET = 'test-secret';
const { default: adminRouter } = await import('../../src/routes/admin.js');

const app = express();
app.use('/admin', adminRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/admin/arena`;
test.after(() => server.close());

const get = (path, init) => fetch(`${base}${path}`, init);

test('the arena endpoints need the setup secret', async () => {
  for (const path of ['', '/next', '/report', '/reset']) {
    assert.equal((await get(path)).status, 403, path);
    assert.equal((await get(`${path}?secret=wrong`)).status, 403, path);
  }
});

test('the page is served with the secret and holds no inline data', async () => {
  const res = await get('?secret=test-secret');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /Generate attack/);
  assert.doesNotMatch(html, /test-secret/, 'the secret is never written into the page');
});

test('next adds attacks, report reads them, reset clears them, counts are capped', async () => {
  const q = '?secret=test-secret';
  await get(`/reset${q}&seed=5`);
  const one = await (await get(`/next${q}`, { method: 'POST' })).json();
  assert.equal(one.runs, 1);
  assert.equal(one.seed, 5);
  const many = await (await get(`/next${q}&count=25`, { method: 'POST' })).json();
  assert.equal(many.runs, 26);
  assert.ok(many.recent.length > 0 && many.recent[0].n === 26, 'newest first');
  assert.equal((await (await get(`/report${q}`)).json()).runs, 26);
  const capped = await (await get(`/next${q}&count=100000`, { method: 'POST' })).json();
  assert.equal(capped.runs, 126);
  const cleared = await (await get(`/reset${q}`, { method: 'POST' })).json();
  assert.equal(cleared.runs, 0);
  assert.equal(cleared.seed, 1);
  assert.equal(mongoose.connection.readyState, 0, 'no database connection was opened');
});
