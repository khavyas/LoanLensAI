# LoanLens RAG: End-to-End Guide

This guide explains where policy documents are uploaded, how an administrator is authenticated, where credentials and data are stored, and how chatbot questions are retrieved and answered.

## 1. Current RAG setup

The active local configuration in backend/.env uses:

| Setting | Current value or purpose |
| --- | --- |
| Chat provider | ollama |
| Mock AI | false |
| Ollama URL | http://localhost:11434 |
| Chat model | qwen2.5:7b |
| Embedding model | nomic-embed-text:latest |
| Chroma URL | https://api.trychroma.com |
| Chroma database | LoanLensRAG |
| Chroma collection | loanlens-policies |
| Retrieval limit | 5 final policy chunks |
| Initial distance cutoff | 1.0 L2 distance; not a confidence percentage |

The tenant and Chroma API key are read from backend/.env. The key is intentionally not written in this guide. The repository sample policy set was indexed into this collection as seven files and 47 chunks.

The Ollama + Chroma path is active only when MOCK_AI=false and CHAT_PROVIDER=ollama. The frontend sends requests to the backend URL configured by EXPO_PUBLIC_API_URL; locally it defaults to http://localhost:4000.

## 2. Roles and screens

### Administrator

The admin role is stored on the MongoDB user record. Public registration accepts borrower or officer only; it cannot create an admin account. Provision an admin from a backend terminal:

~~~powershell
cd D:\LoanLensAI\backend
npm run admin:create
~~~

The command asks for a name and email, then prompts for the password without displaying it. MongoDB stores a bcrypt password hash. The command will not change the role of an account that already uses that email.

At the login page, select **Administrator sign in**. A successful admin login takes the admin directly to the RAG policy document screen. The screen lists indexed files and chunk counts, accepts uploads, and removes documents with their indexed chunks.

The relevant implementation is frontend/src/screens/LoginScreen.js, frontend/src/screens/RagAdminScreen.js, frontend/App.js, backend/src/routes/auth.js, and backend/src/routes/ragAdmin.js.

### Borrower and loan officer

Borrowers and officers use the regular login option. They open an application and use its Assistant tab to ask policy or application questions. A borrower can chat only about their own application. Officers can chat about applications they are authorized to review.

Admins see the policy console instead of borrower/officer application screens. The backend checks the admin role too; hiding a screen in the frontend is not the security boundary.

## 3. Where credentials and data are stored

| Information | Storage and handling |
| --- | --- |
| Admin account email and role | MongoDB users collection |
| Admin password | bcrypt hash in the MongoDB passwordHash field; the backend compares a submitted password to this hash |
| Demo admin reference | The demo email and password are constants in LoginScreen.js and are displayed in the admin login card. They are public to anyone who can load the frontend; use only for a demo and replace before public use. |
| Login session | A signed JWT is returned after login. Its signing secret is backend-only JWT_SECRET. The app/browser session is stored in AsyncStorage as loanlens.session. The token expires after 12 hours. |
| Mongo connection credential | backend/.env under MONGODB_URI; this connects to application/account data |
| Chroma Cloud credential | backend/.env under CHROMA_API_KEY; the backend sends it as x-chroma-token. Never put it in frontend code, EXPO_PUBLIC variables, or committed files. |
| Chroma target | backend/.env settings CHROMA_BASE_URL, CHROMA_TENANT, CHROMA_DATABASE, and CHROMA_COLLECTION. Current database and collection are LoanLensRAG and loanlens-policies. |
| Ollama settings | backend/.env settings OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, OLLAMA_EMBEDDING_MODEL, and optional OLLAMA_API_KEY |
| Borrower uploaded files | Stored through the application document flow, normally MongoDB unless STORAGE_PROVIDER selects R2. These files are separate from the RAG policy collection. |
| Admin-uploaded policy file | File bytes stay in backend memory while processing. Extracted text, chunks, vectors, and source metadata are written to Chroma. The original PDF/text file is not retained by this admin upload flow. |

The Chroma key previously pasted into chat should be rotated and replaced in backend/.env. If deploying, set the new key in the backend service environment as well. Never put it in frontend configuration or this document.

The current demo admin reference shown in the frontend card is email admin@loanlens.demo and password demo@12345678. These values are constants in LoginScreen.js and are visible to anyone who can load the frontend. The admin account in MongoDB stores only a bcrypt hash for the password. This is a demo convenience, not secure production credential handling; replace the account and remove the hard-coded reference values before making the app public.

## 4. Admin document upload: file to vector store

Upload approved policy or FAQ material from the **RAG policy documents** screen. The browser calls the backend, which authenticates the JWT and requires role=admin for every /rag-admin route.

Supported files and limits:

- Markdown (.md), plain text (.txt), and PDF (.pdf)
- Up to 10 files in one batch
- Up to 10 MiB per file
- PDFs must contain selectable text; scanned PDFs need OCR before upload
- Extracted documents need at least 80 characters of usable text

The backend uses memory-backed multipart upload. It sanitizes filenames and checks extensions. Markdown and text files are decoded as UTF-8. For PDFs, PDF.js extracts selectable text page by page, up to 150 pages. It does not run OCR.

The ingestion service then:

1. Normalizes text and splits it around Markdown headings and paragraphs.
2. Builds chunks around 1,200 characters. Very long paragraphs are split with a 120-character overlap so a boundary does not discard all context.
3. Gives each chunk a stable ID and metadata: document ID, filename, title, section, category, chunk index, content hash, and modified time. Borrower/application data is not added.
4. Sends chunk text to the configured Ollama embedding model in batches of up to 32.
5. Sends chunk text, metadata, IDs, and vectors to Chroma using its HTTP API.
6. Removes old chunk IDs for the same document when a re-upload results in a different chunk set.

Document identity is derived from the filename. Uploading a replacement with the same filename replaces that policy document in the collection. Use distinct filenames for distinct policies.

Chroma stores the extracted text and metadata as well as the embeddings. Chroma is the searchable policy store; MongoDB is not the vector store for the active Ollama path.

### Upload and management endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /rag-admin/documents | List policy files grouped by document ID and show chunk counts |
| POST | /rag-admin/documents | Upload multipart form data; each file uses the files field |
| DELETE | /rag-admin/documents/:documentId | Delete a policy document and all its indexed chunks |
| GET | /rag-admin/status | Return collection name and policy chunk count |

These endpoints require a valid JWT for an admin. A 401 means there is no valid session; a 403 means the signed-in account lacks the required role.

The checked-in policy Markdown files can also be indexed from a terminal:

~~~powershell
cd D:\LoanLensAI\backend
npm run ingest:chroma
~~~

This reads Markdown files in data/policies and uses the same chunking, embedding, and Chroma configuration. It does not ingest borrower uploads.

## 5. What happens when someone asks the chatbot a question

The Assistant tab sends the application ID, question, and up to four previous user questions to POST /chat/:applicationId. The backend requires a valid login and checks that the borrower owns the application, or that the user is an officer.

The chat service first loads application and document state from MongoDB. Then:

- If MOCK_AI=true, it returns a demonstration status summary; no real RAG retrieval or model answer occurs.
- If CHAT_PROVIDER=ollama, it uses Chroma vector search and Ollama.
- If CHAT_PROVIDER=anthropic or CHAT_PROVIDER=groq, the older assistant path loads policy chunks from MongoDB into the prompt. Those modes do not use Chroma vector search.

The active local configuration is CHAT_PROVIDER=ollama and MOCK_AI=false.

### A. Route the question

Deterministic rules classify the question before a model is called:

- Status question: asks only about the applicant's current status or missing documents.
- Policy question: asks a general loan/policy question, such as required personal-loan documents or income verification.
- Mixed question: asks for both application status and policy information.
- Unsupported or ambiguous question: returns a supported-topics message or a clarification.

The router, not the language model, decides whether applicant database status is needed. Only user turns from recent history are used for follow-up interpretation; the chat route does not save a transcript.

### B. Status-only questions use MongoDB

For a status-only question, the backend reads the authorized application and its documents from MongoDB. It calculates status and missing document types from current records and returns a deterministic answer. It does not call Ollama or query Chroma.

Applicant-specific facts, such as whether an application is pending, are kept separate from general policy knowledge.

### C. Policy questions are embedded and searched

For a policy or mixed question:

1. Ollama's embedding model turns the question into a numeric vector. A vector represents meaning numerically, allowing related wording to match even when it does not use identical words.
2. The backend queries the loanlens-policies Chroma collection with that question vector. Chroma compares it with stored chunk vectors using the collection distance metric and returns up to 15 candidates (three times the configured top-five).
3. The backend rejects candidates whose distance exceeds RAG_MAX_DISTANCE, removes duplicate text, and keeps at most five chunks. A lower distance means closer according to the metric. The cutoff is a tuning value, not a confidence score or guarantee of correctness.
4. The backend builds a prompt containing the question, selected policy text, and temporary labels P1, P2, etc. It tells the model to answer only from the evidence and return JSON with citations.
5. Ollama's chat model writes the answer. The backend accepts citations only if they map to chunks retrieved for that question. If the model omits valid citations, the backend makes one correction attempt. If citation validation still fails, it returns an insufficient-evidence response.
6. The API returns the answer and source titles/sections. The Assistant screen displays the answer and source chips.

For mixed questions, the status text comes from MongoDB and the policy explanation comes from Chroma plus Ollama. If policy cannot be grounded, the database status remains authoritative and the unsupported policy claim is omitted.

### D. Example sequences

For **“What documents are required for a personal loan?”**:

- The router selects general policy.
- Ollama embeds the question.
- Chroma finds matching sections in personal-loan-requirements.md and may return other nearby chunks.
- Distance filtering and de-duplication select the best evidence.
- Ollama answers from those passages and cites a matching P-label.
- The backend validates the label and maps it to source title, filename, and section.

For **“What is my application status?”**:

- The backend checks the signed-in user's access to the application.
- MongoDB supplies the application and its current document records.
- A deterministic status answer is returned.
- Chroma and Ollama are not needed.

## 6. Troubleshooting

| Symptom | Checks |
| --- | --- |
| Supported-topics message for a loan question | The wording may not match a router rule. Inspect backend/src/services/loanQuestionRouter.js and confirm the backend restarted after changes. |
| “Could not find relevant information” | Confirm the document is listed in the admin console, has readable text/chunks, and is in the configured Chroma tenant/database/collection. Review RAG_MAX_DISTANCE and try another wording. |
| “Could not verify a relevant policy source” | Retrieval found evidence but the model returned no usable citation. Check OLLAMA_CHAT_MODEL; small models may omit required JSON citations. The answer is blocked until validation succeeds. |
| Ollama connection error | Ensure Ollama is running, both configured models are installed, and OLLAMA_BASE_URL is reachable from the backend host. |
| Chroma connection/authentication error | Check CHROMA_BASE_URL, tenant/database/collection, and the rotated CHROMA_API_KEY in the backend environment. |
| Admin console returns 401 | Sign in again; the JWT expires after 12 hours. |
| Admin console returns 403 | The account must have role=admin in MongoDB. Public registration cannot grant this role. |
| An upload is rejected | Check file extension, 10 MiB limit, readable UTF-8, PDF text layer, and the minimum 80-character requirement. |

## 7. Local versus Render deployment

The current local OLLAMA_BASE_URL is http://localhost:11434. This works when the backend and Ollama run on the same computer. In a Render backend container, localhost means the Render container; it does not point to your laptop. General Chroma + Ollama questions will fail from Render unless the backend has a secure, reachable Ollama endpoint, or the app uses another configured chat/embedding provider.

Chroma Cloud is remote and can be reached from local or Render when the backend has the correct endpoint, tenant, database, collection, and API key. Set the secret in the backend service environment, never in the static frontend. A URL mentioned elsewhere in project docs is not proof that a deployment currently uses Ollama or that its health has been verified.

## 8. Source files for this flow

- frontend/src/screens/LoginScreen.js — separate admin sign-in and demo credential reference
- frontend/src/screens/RagAdminScreen.js — upload, list, refresh, and remove policy documents
- frontend/src/api/client.js — admin and chat HTTP requests
- frontend/App.js — routes admins to the RAG console
- backend/src/routes/auth.js — login, admin role restriction, and session token
- backend/src/scripts/createAdmin.js — interactive admin creation
- backend/src/routes/ragAdmin.js — admin-only upload/list/delete/status endpoints
- backend/src/services/policyFileText.js — text/PDF extraction and validation
- backend/src/services/policyChunker.js — policy chunking and stable IDs
- backend/src/services/policyIngestion.js — embedding and Chroma upsert/update
- backend/src/services/ollamaClient.js — Ollama embedding and chat requests
- backend/src/services/chromaService.js — Chroma Cloud HTTP API adapter
- backend/src/services/loanQuestionRouter.js — status/policy/unsupported routing
- backend/src/services/ragOllama.js — question embedding, retrieval, grounded answer, status composition
- backend/src/services/ragPromptBuilder.js — prompt format and citation checks
- backend/src/services/rag.js — selects mock, Anthropic, Groq, or Ollama assistant path
- backend/src/routes/chat.js — JWT check, application authorization, and chat request handling
