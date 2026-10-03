import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Where an uploaded file's bytes live.
//   STORAGE_PROVIDER=mongo (default) - bytes stay in the Document's fileData
//                                      field, exactly as before. Zero change.
//   STORAGE_PROVIDER=r2              - bytes go to a private Cloudflare R2
//                                      bucket; MongoDB keeps only metadata.
// Every call below degrades to the Mongo path instead of throwing, so an R2
// outage, a missing env var or a typo can never make an upload fail.
//
// Provider and credentials are read at call time (not module load) so this
// file is safe to import with nothing configured, same reason groqClient.js
// builds its client lazily.

const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  // R2_ENDPOINT exists only so tests can point at a local fake; production
  // always derives the endpoint from the account id.
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  const complete = Boolean(accessKeyId && secretAccessKey && bucket && endpoint);
  return { accessKeyId, secretAccessKey, bucket, endpoint, complete, local: Boolean(process.env.R2_ENDPOINT) };
}

export function activeProvider() {
  return (process.env.STORAGE_PROVIDER || 'mongo').toLowerCase() === 'r2' ? 'r2' : 'mongo';
}

let _client = null;
let _clientKey = null;
function client() {
  const cfg = r2Config();
  const key = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.bucket}`;
  if (!_client || _clientKey !== key) {
    _client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.local,
      // Newer SDK versions add checksum headers by default that S3-compatible
      // stores don't always accept; only send them when the API requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    _clientKey = key;
  }
  return _client;
}

// IDs only - never a name, email or SSN. t/default is the single-bank
// placeholder until a real tenant id exists (see RAG plan, task P2-01).
export function buildKey({ applicationId, documentId, mimeType }) {
  return `t/default/a/${applicationId}/d/${documentId}/v1.${EXT[mimeType] || 'bin'}`;
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// Returns the fields to merge into the new Document record.
export async function storeFile({ applicationId, documentId, mimeType, bytes }) {
  const base = { size: bytes.length, sha256: sha256(bytes) };
  if (activeProvider() !== 'r2') return { ...base, storageProvider: 'mongo', fileData: bytes };

  const cfg = r2Config();
  if (!cfg.complete) {
    console.error('[storage] STORAGE_PROVIDER=r2 but R2_* settings are incomplete - storing in MongoDB instead');
    return { ...base, storageProvider: 'mongo', fileData: bytes };
  }
  const storageKey = buildKey({ applicationId, documentId, mimeType });
  try {
    await client().send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: storageKey, Body: bytes, ContentType: mimeType })
    );
    return { ...base, storageProvider: 'r2', storageKey };
  } catch (err) {
    console.error('[storage] R2 upload failed, storing in MongoDB instead:', err.message);
    return { ...base, storageProvider: 'mongo', fileData: bytes };
  }
}

// Returns a Buffer, or null if this document has no stored bytes.
// Throws only when a document that IS in R2 can't be fetched from it.
export async function readStoredFile(doc) {
  if (doc.storageProvider === 'r2' && doc.storageKey) {
    const cfg = r2Config();
    if (!cfg.complete) throw new Error('R2 is not configured on this server');
    const res = await client().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: doc.storageKey }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  return doc.fileData || null;
}

// Best effort: a failed cleanup leaves an orphan object, never a failed request.
export async function deleteStoredFile(doc) {
  if (doc.storageProvider !== 'r2' || !doc.storageKey) return;
  const cfg = r2Config();
  if (!cfg.complete) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: doc.storageKey }));
  } catch (err) {
    console.error('[storage] failed to delete R2 object (orphan left behind):', doc.storageKey, err.message);
  }
}

// Used by /admin/storage-check: a real write -> read -> delete round trip.
export async function checkStorage() {
  const provider = activeProvider();
  const cfg = r2Config();
  const configured = {
    R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: Boolean(cfg.accessKeyId),
    R2_SECRET_ACCESS_KEY: Boolean(cfg.secretAccessKey),
    R2_BUCKET: Boolean(cfg.bucket),
  };
  if (provider !== 'r2') {
    return { ok: true, provider, note: 'STORAGE_PROVIDER is not "r2" - files are stored in MongoDB', configured };
  }
  if (!cfg.complete) return { ok: false, provider, error: 'R2 settings incomplete', configured };

  const key = `healthcheck/${Date.now()}.txt`;
  const payload = Buffer.from(`loanlens storage check ${new Date().toISOString()}`);
  const started = Date.now();
  try {
    await client().send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: payload, ContentType: 'text/plain' }));
    const got = await client().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    const back = Buffer.from(await got.Body.transformToByteArray());
    await client().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    if (!back.equals(payload)) return { ok: false, provider, error: 'Read-back did not match what was written', configured };
    return { ok: true, provider, bucket: cfg.bucket, roundTripMs: Date.now() - started, configured };
  } catch (err) {
    return { ok: false, provider, error: err.message, configured };
  }
}
