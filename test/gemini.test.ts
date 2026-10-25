import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptGeminiKey,
  askGemini,
  clearGeminiKey,
  geminiKeyStatus,
  getGeminiKey,
  GeminiError,
  setGeminiKey,
  useKeyBackend,
  type KeyBackend,
} from '../src/gemini/index.ts';

const KEY = 'fake-test-key-0123456789abcdef';

/** An in-memory key store instead of the OS credential store. */
function memoryStore(initial: string | null = null): KeyBackend & { value: string | null } {
  const store = {
    value: initial,
    get: () => store.value,
    set: (v: string) => {
      store.value = v;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

function withoutEnv<T>(run: () => T): T {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
}

test('one shared key: saved, read, adopted from an old app copy, cleared', () =>
  withoutEnv(() => {
    const store = memoryStore();
    useKeyBackend(store);
    assert.deepEqual(geminiKeyStatus(), { hasKey: false, source: null, storeAvailable: true });
    assert.throws(() => setGeminiKey('not a key'), /does not look like/);

    assert.equal(adoptGeminiKey(KEY), true, 'an app-only key moves in when none is shared');
    assert.equal(getGeminiKey(), KEY);
    assert.equal(adoptGeminiKey('fake-other-key-0123456789abcdef'), false, 'never replaces the shared key');
    assert.equal(geminiKeyStatus().source, 'store');

    clearGeminiKey();
    assert.equal(getGeminiKey(), null);
    setGeminiKey(`  ${KEY}\n`);
    assert.equal(store.value, KEY, 'trimmed');
  }));

test('GEMINI_API_KEY wins over the shared key; placeholders are ignored', () => {
  useKeyBackend(memoryStore(KEY));
  const saved = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'fake-env-key-0123456789abcdefgh';
    assert.equal(getGeminiKey(), 'fake-env-key-0123456789abcdefgh');
    assert.equal(geminiKeyStatus().source, 'env');
    assert.equal(getGeminiKey({ env: false }), KEY);
    process.env.GEMINI_API_KEY = 'MY GEMINI API KEY';
    assert.equal(getGeminiKey(), KEY);
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('without a credential store, saving fails plainly', () =>
  withoutEnv(() => {
    useKeyBackend(null);
    assert.equal(geminiKeyStatus().storeAvailable, false);
    assert.throws(() => setGeminiKey(KEY), /not available/);
    assert.equal(adoptGeminiKey(KEY), false);
  }));

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

type Reply = { status: number; body: unknown };
const answer = (text: string): Reply => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });
const failure = (status: number, message: string, details?: unknown[]): Reply => ({ status, body: { error: { message, details } } });

/** A fetch that plays back replies in order and records which model each request asked. */
function fakeFetch(replies: Reply[]) {
  const models: string[] = [];
  const bodies: any[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    models.push(decodeURIComponent(String(url).match(/models\/([^:]+):/)![1]));
    bodies.push(JSON.parse(String(init.body)));
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], KEY);
    const reply = replies.shift() ?? failure(500, 'no more replies');
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as unknown as typeof fetch;
  return { fn, models, bodies };
}

const fast = { apiKey: KEY, models: ['m1', 'm2', 'm3'] };

test('the client asks for JSON at temperature 0 and returns the text', async () => {
  const f = fakeFetch([answer('{"ok":true}')]);
  assert.equal(await askGemini('hi', { ...fast, fetch: f.fn }), '{"ok":true}');
  assert.deepEqual(f.bodies[0].generationConfig, { temperature: 0, responseMimeType: 'application/json' });
  assert.equal(f.bodies[0].contents[0].parts[0].text, 'hi');

  const g = fakeFetch([answer('plain')]);
  await askGemini('hi', { ...fast, fetch: g.fn, json: false, tools: [{ googleSearch: {} }] });
  assert.deepEqual(g.bodies[0].tools, [{ googleSearch: {} }]);
  assert.equal(g.bodies[0].generationConfig.responseMimeType, undefined);
});

test('a rate-limited model hands over to the next', async () => {
  const f = fakeFetch([failure(429, 'quota'), answer('{"ok":true}')]);
  assert.equal(await askGemini('hi', { ...fast, fetch: f.fn }), '{"ok":true}');
  assert.deepEqual(f.models, ['m1', 'm2']);
});

test('when every model is rate limited, the error says so and when to retry', async () => {
  const f = fakeFetch([failure(429, 'quota', [{ retryDelay: '37s' }]), failure(429, 'Please retry in 12.5s'), failure(429, 'quota')]);
  await assert.rejects(askGemini('hi', { ...fast, fetch: f.fn }), (err: GeminiError) => {
    assert.equal(err.rateLimited, true);
    assert.equal(err.retryAfter, 13);
    return true;
  });
});

test('a rejected key stops at once; no other model would help', async () => {
  const f = fakeFetch([failure(400, 'API key not valid')]);
  await assert.rejects(askGemini('hi', { ...fast, fetch: f.fn }), /API key not valid/);
  assert.deepEqual(f.models, ['m1']);
});

test('unusable answers are retried on the same model, then the next', async () => {
  const f = fakeFetch([answer('sorry'), answer('still sorry'), answer('{"a":1}')]);
  const text = await askGemini('hi', { ...fast, fetch: f.fn, accept: (t) => t.startsWith('{') });
  assert.equal(text, '{"a":1}');
  assert.deepEqual(f.models, ['m1', 'm1', 'm2']);
});

test('no key, no request', async () => {
  useKeyBackend(memoryStore());
  await withoutEnv(async () => {
    await assert.rejects(askGemini('hi', { models: ['m1'] }), /No Gemini API key/);
  });
});
