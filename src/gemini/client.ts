// ---------------------------------------------------------------------------
// A small Gemini client over the REST API, walking a list of models: a
// rate-limited or unavailable model hands over to the next. 503s are retried
// on the same model with a short backoff; a rejected key or request (400, 401,
// 403) stops at once, since no other model would help.
// ---------------------------------------------------------------------------

import { getGeminiKey } from './keyStore.js';

/** Cheapest and fastest first. */
export const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const MAX_PROMPT_CHARS = 400_000;

export interface AskOptions {
  /** Defaults to getGeminiKey(): GEMINI_API_KEY, else the shared key. */
  apiKey?: string;
  models?: string[];
  /** Ask for a JSON answer (responseMimeType application/json). Default true. */
  json?: boolean;
  /** Default 0, for repeatable answers. */
  temperature?: number;
  /** Passed through, e.g. [{ googleSearch: {} }]. */
  tools?: unknown[];
  /** Merged into generationConfig. */
  generationConfig?: Record<string, unknown>;
  /** Per request. Default 60 s. */
  timeoutMs?: number;
  /** Tries per model (503s and unacceptable answers). Default 2. */
  attemptsPerModel?: number;
  /** Ceiling on the whole walk through the models. Default 150 s. */
  overallBudgetMs?: number;
  /** Return false to reject an answer and try again or move on, e.g. hasJsonObject. */
  accept?: (text: string) => boolean;
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

export class GeminiError extends Error {
  /** The HTTP status, when the API answered. */
  readonly status?: number;
  /** Every model was rate limited (429); retryAfter says roughly when to try again, in seconds. */
  readonly rateLimited: boolean;
  readonly retryAfter?: number;

  constructor(message: string, details: { status?: number; rateLimited?: boolean; retryAfter?: number } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = details.status;
    this.rateLimited = details.rateLimited ?? false;
    this.retryAfter = details.retryAfter;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds from a 429's RetryInfo ("37s") or its message ("retry in 37.2s"). */
function retryAfterSeconds(error: any): number | undefined {
  const info = (error?.details ?? []).find((d: any) => typeof d?.retryDelay === 'string');
  const text = info?.retryDelay ?? String(error?.message ?? '').match(/retry in ([\d.]+)s/i)?.[1];
  const seconds = parseFloat(text ?? '');
  return Number.isFinite(seconds) ? Math.ceil(seconds) : undefined;
}

/** Asks Gemini and resolves with the answer's text. */
export async function askGemini(prompt: string, options: AskOptions = {}): Promise<string> {
  const apiKey = options.apiKey ?? getGeminiKey();
  if (!apiKey) throw new GeminiError('No Gemini API key is set.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new GeminiError('Nothing to ask');
  if (prompt.length > MAX_PROMPT_CHARS) throw new GeminiError('The prompt is too long');

  const models = options.models?.length ? options.models : DEFAULT_MODELS;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const attemptsPerModel = Math.max(1, options.attemptsPerModel ?? 2);
  const budgetMs = options.overallBudgetMs ?? 150_000;
  const accept = options.accept ?? ((text: string) => text.length > 0);
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(options.tools ? { tools: options.tools } : {}),
    generationConfig: {
      temperature: options.temperature ?? 0,
      ...(options.json !== false ? { responseMimeType: 'application/json' } : {}),
      ...options.generationConfig,
    },
  });

  const startedAt = Date.now();
  let lastError: GeminiError | null = null;
  let rateLimits = 0;
  let retryAfter: number | undefined;

  for (const model of models) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      if (Date.now() - startedAt > budgetMs) throw lastError ?? new GeminiError('Gemini did not answer in time');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status: number | undefined;
      try {
        const res = await doFetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: controller.signal,
        });
        status = res.status;
        const data: any = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
          if (accept(text)) return text;
          lastError = new GeminiError(text ? 'Gemini gave an answer that could not be used' : 'Gemini gave an empty answer', { status });
          continue; // same model again
        }
        const message = data.error?.message || `Gemini error ${res.status}`;
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError(message, { status });
        if (res.status === 429) {
          rateLimits++;
          retryAfter = retryAfterSeconds(data.error) ?? retryAfter;
          lastError = new GeminiError(message, { status });
          break; // next model
        }
        lastError = new GeminiError(message, { status });
        if (res.status === 503 && attempt < attemptsPerModel) {
          await sleep(2000 * attempt);
          continue;
        }
        break; // another error: next model
      } catch (err: any) {
        if (err instanceof GeminiError) throw err;
        lastError = new GeminiError(err?.name === 'AbortError' ? 'Gemini did not answer in time' : String(err?.message ?? err), { status });
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  if (rateLimits === models.length) {
    throw new GeminiError('Gemini rate limit reached. Try again in a minute.', { status: 429, rateLimited: true, retryAfter: retryAfter ?? 60 });
  }
  throw lastError ?? new GeminiError('Gemini is not available right now');
}
