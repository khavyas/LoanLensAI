import { RAG_CONFIG } from '../config/rag.js';

// Small native-fetch client for Ollama's /api/chat API.
async function postJson(url, body, timeoutMs, label, externalSignal) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(RAG_CONFIG.ollamaApiKey ? { Authorization: `Bearer ${RAG_CONFIG.ollamaApiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: externalSignal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`${label} timed out. Check the Ollama service and timeout configuration.`);
    }
    throw new Error(`${label} could not reach Ollama at the configured URL.`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return payload;
}

export async function generateChatJson(messages, signal) {
  const result = await postJson(
    `${RAG_CONFIG.ollamaBaseUrl}/api/chat`,
    {
      model: RAG_CONFIG.ollamaChatModel,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: 768 },
    },
    RAG_CONFIG.ollamaTimeoutMs,
    'Ollama chat',
    signal
  );
  const content = result.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned an empty chat response.');
  }
  return content;
}
