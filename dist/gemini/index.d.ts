declare const KEY_SERVICE = "shop-teacher";
declare const KEY_ACCOUNT = "gemini-api-key";
/** Where keys are kept; the OS credential store unless replaced (tests, unsupported systems). */
interface KeyBackend {
    get(): string | null;
    set(value: string): void;
    clear(): void;
}
/** Replaces the credential store, e.g. with an in-memory one in tests; null disables storing. */
declare function useKeyBackend(replacement: KeyBackend | null): void;
/** True for strings shaped like a Google API key (letters, digits, "-" and "_"). */
declare const isGeminiKey: (value: unknown) => value is string;
/** The key in the shared credential store, or null. */
declare const storedGeminiKey: () => string | null;
/** The key to use: GEMINI_API_KEY from the environment, else the shared one; null when neither is set. */
declare function getGeminiKey(options?: {
    env?: boolean;
}): string | null;
interface GeminiKeyStatus {
    hasKey: boolean;
    /** Where the key in use comes from. */
    source: 'env' | 'store' | null;
    /** The shared credential store works on this machine, so setGeminiKey can be used. */
    storeAvailable: boolean;
}
declare function geminiKeyStatus(): GeminiKeyStatus;
/** Saves the key for every app; throws when it does not look like a key or nothing can store it. */
declare function setGeminiKey(key: string): void;
/** Forgets the shared key (in every app). */
declare function clearGeminiKey(): void;
/**
 * Moves an app's old, app-only key into the shared store when the shared store
 * has none yet. Returns true when it was stored, so the app can delete its copy.
 */
declare function adoptGeminiKey(key: string | null | undefined): boolean;

/** Cheapest and fastest first. */
declare const DEFAULT_MODELS: string[];
interface AskOptions {
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
declare class GeminiError extends Error {
    /** The HTTP status, when the API answered. */
    readonly status?: number;
    /** Every model was rate limited (429); retryAfter says roughly when to try again, in seconds. */
    readonly rateLimited: boolean;
    readonly retryAfter?: number;
    constructor(message: string, details?: {
        status?: number;
        rateLimited?: boolean;
        retryAfter?: number;
    });
}
/** Asks Gemini and resolves with the answer's text. */
declare function askGemini(prompt: string, options?: AskOptions): Promise<string>;

export { DEFAULT_MODELS, GeminiError, KEY_ACCOUNT, KEY_SERVICE, adoptGeminiKey, askGemini, clearGeminiKey, geminiKeyStatus, getGeminiKey, isGeminiKey, setGeminiKey, storedGeminiKey, useKeyBackend };
export type { AskOptions, GeminiKeyStatus, KeyBackend };
