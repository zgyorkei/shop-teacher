// ---------------------------------------------------------------------------
// One Gemini API key for every app of this user on this machine.
//
// The key lives in the OS credential store (Windows Credential Manager, the
// macOS keychain, the Secret Service on Linux) under the service
// "shop-teacher", so any app using this package reads the key the user
// entered in any other. It is protected by the user's login, as Electron's
// safeStorage would protect it, but unlike safeStorage it is not tied to one
// app. GEMINI_API_KEY in the environment wins, for servers and CI.
//
// Main process / Node only. Apps can say whether a key is set, but should
// never hand the key itself to a renderer or a web page.
// ---------------------------------------------------------------------------

import { createRequire } from 'node:module';

export const KEY_SERVICE = 'shop-teacher';
export const KEY_ACCOUNT = 'gemini-api-key';

/** Where keys are kept; the OS credential store unless replaced (tests, unsupported systems). */
export interface KeyBackend {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

interface KeyringEntry {
  getPassword(): string | null | undefined;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

let backend: KeyBackend | null | undefined;

// The native module is loaded at run time, never bundled. Inside a CommonJS bundle
// (esbuild, webpack) import.meta.url is empty, but that bundle's own require works.
const nodeRequire = (): NodeJS.Require => (typeof require === 'function' ? require : createRequire(import.meta.url));

function credentialStore(): KeyBackend | null {
  try {
    const { Entry } = nodeRequire()('@napi-rs/keyring') as {
      Entry: new (service: string, account: string) => KeyringEntry;
    };
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
          // Nothing stored.
        }
      },
    };
  } catch {
    // No prebuilt binary for this platform: the environment variable still works.
    return null;
  }
}

const store = (): KeyBackend | null => (backend === undefined ? (backend = credentialStore()) : backend);

/** Replaces the credential store, e.g. with an in-memory one in tests; null disables storing. */
export function useKeyBackend(replacement: KeyBackend | null): void {
  backend = replacement;
}

/** True for strings shaped like a Google API key (letters, digits, "-" and "_"). */
export const isGeminiKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{20,200}$/.test(value.trim());

// Placeholders from .env.example files are not keys.
const fromEnv = (): string | null => {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value && isGeminiKey(value) ? value : null;
};

/** The key in the shared credential store, or null. */
export const storedGeminiKey = (): string | null => {
  const value = store()?.get()?.trim();
  return value && isGeminiKey(value) ? value : null;
};

/** The key to use: GEMINI_API_KEY from the environment, else the shared one; null when neither is set. */
export function getGeminiKey(options: { env?: boolean } = {}): string | null {
  return (options.env !== false ? fromEnv() : null) ?? storedGeminiKey();
}

export interface GeminiKeyStatus {
  hasKey: boolean;
  /** Where the key in use comes from. */
  source: 'env' | 'store' | null;
  /** The shared credential store works on this machine, so setGeminiKey can be used. */
  storeAvailable: boolean;
}

export function geminiKeyStatus(): GeminiKeyStatus {
  const source = fromEnv() ? 'env' : storedGeminiKey() ? 'store' : null;
  return { hasKey: source !== null, source, storeAvailable: store() !== null };
}

/** Saves the key for every app; throws when it does not look like a key or nothing can store it. */
export function setGeminiKey(key: string): void {
  const value = String(key ?? '').trim();
  if (!isGeminiKey(value)) throw new Error('That does not look like a Gemini API key');
  const target = store();
  if (!target) throw new Error('Secure storage is not available on this computer; set GEMINI_API_KEY instead');
  target.set(value);
}

/** Forgets the shared key (in every app). */
export function clearGeminiKey(): void {
  store()?.clear();
}

/**
 * Moves an app's old, app-only key into the shared store when the shared store
 * has none yet. Returns true when it was stored, so the app can delete its copy.
 */
export function adoptGeminiKey(key: string | null | undefined): boolean {
  if (!key || !isGeminiKey(key) || storedGeminiKey()) return false;
  try {
    setGeminiKey(key);
    return storedGeminiKey() === key.trim();
  } catch {
    return false;
  }
}
