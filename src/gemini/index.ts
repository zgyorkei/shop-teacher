// Node only: the shared Gemini key and the Gemini client.
export {
  getGeminiKey,
  storedGeminiKey,
  setGeminiKey,
  clearGeminiKey,
  adoptGeminiKey,
  geminiKeyStatus,
  isGeminiKey,
  useKeyBackend,
  KEY_SERVICE,
  KEY_ACCOUNT,
  type GeminiKeyStatus,
  type KeyBackend,
} from './keyStore.js';
export { askGemini, GeminiError, DEFAULT_MODELS, type AskOptions } from './client.js';
