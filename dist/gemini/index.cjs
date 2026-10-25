"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/gemini/index.ts
var gemini_exports = {};
__export(gemini_exports, {
  DEFAULT_MODELS: () => DEFAULT_MODELS,
  GeminiError: () => GeminiError,
  KEY_ACCOUNT: () => KEY_ACCOUNT,
  KEY_SERVICE: () => KEY_SERVICE,
  adoptGeminiKey: () => adoptGeminiKey,
  askGemini: () => askGemini,
  clearGeminiKey: () => clearGeminiKey,
  geminiKeyStatus: () => geminiKeyStatus,
  getGeminiKey: () => getGeminiKey,
  isGeminiKey: () => isGeminiKey,
  setGeminiKey: () => setGeminiKey,
  storedGeminiKey: () => storedGeminiKey,
  useKeyBackend: () => useKeyBackend
});
module.exports = __toCommonJS(gemini_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// src/gemini/keyStore.ts
var import_node_module = require("module");
var KEY_SERVICE = "shop-teacher";
var KEY_ACCOUNT = "gemini-api-key";
var backend;
var nodeRequire = () => typeof require === "function" ? require : (0, import_node_module.createRequire)(importMetaUrl);
function credentialStore() {
  try {
    const { Entry } = nodeRequire()("@napi-rs/keyring");
    const entry = () => new Entry(KEY_SERVICE, KEY_ACCOUNT);
    return {
      get: () => {
        try {
          return entry().getPassword() || null;
        } catch {
          return null;
        }
      },
      set: (value) => entry().setPassword(value),
      clear: () => {
        try {
          entry().deletePassword();
        } catch {
        }
      }
    };
  } catch {
    return null;
  }
}
var store = () => backend === void 0 ? backend = credentialStore() : backend;
function useKeyBackend(replacement) {
  backend = replacement;
}
var isGeminiKey = (value) => typeof value === "string" && /^[\w-]{20,200}$/.test(value.trim());
var fromEnv = () => {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value && isGeminiKey(value) ? value : null;
};
var storedGeminiKey = () => {
  const value = store()?.get()?.trim();
  return value && isGeminiKey(value) ? value : null;
};
function getGeminiKey(options = {}) {
  return (options.env !== false ? fromEnv() : null) ?? storedGeminiKey();
}
function geminiKeyStatus() {
  const source = fromEnv() ? "env" : storedGeminiKey() ? "store" : null;
  return { hasKey: source !== null, source, storeAvailable: store() !== null };
}
function setGeminiKey(key) {
  const value = String(key ?? "").trim();
  if (!isGeminiKey(value)) throw new Error("That does not look like a Gemini API key");
  const target = store();
  if (!target) throw new Error("Secure storage is not available on this computer; set GEMINI_API_KEY instead");
  target.set(value);
}
function clearGeminiKey() {
  store()?.clear();
}
function adoptGeminiKey(key) {
  if (!key || !isGeminiKey(key) || storedGeminiKey()) return false;
  try {
    setGeminiKey(key);
    return storedGeminiKey() === key.trim();
  } catch {
    return false;
  }
}

// src/gemini/client.ts
var DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
var DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
var MAX_PROMPT_CHARS = 4e5;
var GeminiError = class extends Error {
  /** The HTTP status, when the API answered. */
  status;
  /** Every model was rate limited (429); retryAfter says roughly when to try again, in seconds. */
  rateLimited;
  retryAfter;
  constructor(message, details = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = details.status;
    this.rateLimited = details.rateLimited ?? false;
    this.retryAfter = details.retryAfter;
  }
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function retryAfterSeconds(error) {
  const info = (error?.details ?? []).find((d) => typeof d?.retryDelay === "string");
  const text = info?.retryDelay ?? String(error?.message ?? "").match(/retry in ([\d.]+)s/i)?.[1];
  const seconds = parseFloat(text ?? "");
  return Number.isFinite(seconds) ? Math.ceil(seconds) : void 0;
}
async function askGemini(prompt, options = {}) {
  const apiKey = options.apiKey ?? getGeminiKey();
  if (!apiKey) throw new GeminiError("No Gemini API key is set.");
  if (typeof prompt !== "string" || !prompt.trim()) throw new GeminiError("Nothing to ask");
  if (prompt.length > MAX_PROMPT_CHARS) throw new GeminiError("The prompt is too long");
  const models = options.models?.length ? options.models : DEFAULT_MODELS;
  const timeoutMs = options.timeoutMs ?? 6e4;
  const attemptsPerModel = Math.max(1, options.attemptsPerModel ?? 2);
  const budgetMs = options.overallBudgetMs ?? 15e4;
  const accept = options.accept ?? ((text) => text.length > 0);
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...options.tools ? { tools: options.tools } : {},
    generationConfig: {
      temperature: options.temperature ?? 0,
      ...options.json !== false ? { responseMimeType: "application/json" } : {},
      ...options.generationConfig
    }
  });
  const startedAt = Date.now();
  let lastError = null;
  let rateLimits = 0;
  let retryAfter;
  for (const model of models) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      if (Date.now() - startedAt > budgetMs) throw lastError ?? new GeminiError("Gemini did not answer in time");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status;
      try {
        const res = await doFetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: controller.signal
        });
        status = res.status;
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
          if (accept(text)) return text;
          lastError = new GeminiError(text ? "Gemini gave an answer that could not be used" : "Gemini gave an empty answer", { status });
          continue;
        }
        const message = data.error?.message || `Gemini error ${res.status}`;
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError(message, { status });
        if (res.status === 429) {
          rateLimits++;
          retryAfter = retryAfterSeconds(data.error) ?? retryAfter;
          lastError = new GeminiError(message, { status });
          break;
        }
        lastError = new GeminiError(message, { status });
        if (res.status === 503 && attempt < attemptsPerModel) {
          await sleep(2e3 * attempt);
          continue;
        }
        break;
      } catch (err) {
        if (err instanceof GeminiError) throw err;
        lastError = new GeminiError(err?.name === "AbortError" ? "Gemini did not answer in time" : String(err?.message ?? err), { status });
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  if (rateLimits === models.length) {
    throw new GeminiError("Gemini rate limit reached. Try again in a minute.", { status: 429, rateLimited: true, retryAfter: retryAfter ?? 60 });
  }
  throw lastError ?? new GeminiError("Gemini is not available right now");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_MODELS,
  GeminiError,
  KEY_ACCOUNT,
  KEY_SERVICE,
  adoptGeminiKey,
  askGemini,
  clearGeminiKey,
  geminiKeyStatus,
  getGeminiKey,
  isGeminiKey,
  setGeminiKey,
  storedGeminiKey,
  useKeyBackend
});
