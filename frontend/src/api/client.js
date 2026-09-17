const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

let authToken = null;
export function setToken(token) {
  authToken = token;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// The file route serves raw bytes, not JSON, and needs the same auth header
// as everything else — a plain <a href> or window.open can't attach that
// header, so preview/download goes through an authenticated fetch that
// returns a Blob the caller turns into an object URL instead.
async function fetchDocumentBlob(documentId) {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE_URL}/documents/${documentId}/file`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load file (${res.status})`);
  }
  return res.blob();
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  applications: () => request('/applications'),
  application: (id) => request(`/applications/${id}`),
  createApplication: (payload) => request('/applications', { method: 'POST', body: payload }),
  uploadDocument: (applicationId, formData) =>
    request(`/documents/${applicationId}`, { method: 'POST', body: formData }),
  deleteDocument: (documentId) => request(`/documents/${documentId}`, { method: 'DELETE' }),
  fetchDocumentBlob,
  ask: (applicationId, question) =>
    request(`/chat/${applicationId}`, { method: 'POST', body: { question } }),
};
