// NEW: Central configuration for the optional Ollama + Chroma RAG path.
export const RAG_CONFIG = Object.freeze({
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaApiKey: process.env.OLLAMA_API_KEY || '',
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || 'gemma4',
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 120000),
  embeddingProvider: (process.env.EMBEDDING_PROVIDER || 'ollama').toLowerCase(),
  chromaEmbeddingUrl: (process.env.CHROMA_EMBEDDING_URL || 'https://embed.trychroma.com/embed').replace(/\/$/, ''),
  chromaEmbeddingModel: process.env.CHROMA_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-0.6B',
  chromaEmbeddingTimeoutMs: Number(process.env.CHROMA_EMBEDDING_TIMEOUT_MS || 120000),
  embeddingModel: (process.env.EMBEDDING_PROVIDER || 'ollama').toLowerCase() === 'chroma-cloud'
    ? (process.env.CHROMA_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-0.6B')
    : (process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma'),
  chromaBaseUrl: (process.env.CHROMA_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  chromaApiKey: process.env.CHROMA_API_KEY || '',
  chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
  chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
  chromaCollection: process.env.CHROMA_COLLECTION || 'loan-knowledge',
  chromaTimeoutMs: Number(process.env.CHROMA_TIMEOUT_MS || 30000),
  topK: Number(process.env.RAG_TOP_K || 5),
  maxDistance: Number(process.env.RAG_MAX_DISTANCE ?? 1),
  embeddingBatchSize: Number(process.env.RAG_EMBED_BATCH_SIZE || 32),
  maxQuestionChars: Number(process.env.RAG_MAX_QUESTION_CHARS || 4000),
});
