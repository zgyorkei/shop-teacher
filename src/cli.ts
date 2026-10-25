// `shop-teacher key <status|set|clear|test>`: manages the Gemini key that every
// app using this package shares.

import { createInterface } from 'node:readline';
import { askGemini, clearGeminiKey, geminiKeyStatus, setGeminiKey } from './gemini/index.js';

const USAGE = `Usage: shop-teacher key <command>

  status   Says whether a key is set and where it comes from
  set      Saves a key for every app (asks for it; nothing is echoed)
  clear    Forgets the saved key
  test     Sends a tiny request to Gemini with the key in use`;

/** Reads one line without echoing it, so the key does not land in the terminal's scrollback. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as any)._writeToOutput?.bind(rl);
    (rl as any)._writeToOutput = (text: string) => {
      if (text.includes(question)) write?.(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main(args: string[]): Promise<number> {
  const [group, command] = args;
  if (group !== 'key' || !command) {
    console.log(USAGE);
    return group ? 1 : 0;
  }
  switch (command) {
    case 'status': {
      const s = geminiKeyStatus();
      if (!s.hasKey) console.log('No Gemini key is set.');
      else console.log(s.source === 'env' ? 'A key is set by GEMINI_API_KEY in the environment.' : 'A shared key is saved in the credential store.');
      if (!s.storeAvailable) console.log('The credential store is not available here; only GEMINI_API_KEY works.');
      return 0;
    }
    case 'set': {
      const key = process.stdin.isTTY ? await askHidden('Gemini API key: ') : (await readStdin()).trim();
      setGeminiKey(key);
      console.log('Saved. Every app using shop-teacher now uses this key.');
      return 0;
    }
    case 'clear':
      clearGeminiKey();
      console.log('The saved key was removed.');
      return 0;
    case 'test': {
      const text = await askGemini('Reply with the JSON object {"ok": true} and nothing else.', { timeoutMs: 20_000 });
      console.log(`Gemini answered: ${text.trim().slice(0, 80)}`);
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  }
);
