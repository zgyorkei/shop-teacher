// ---------------------------------------------------------------------------
// Teaching a shop's search page: the app's browser captures the search page
// for a few sample LEGO sets, Gemini writes a search recipe from those
// captures, and the recipe is run on the same live pages before anything is
// saved. If it finds nothing, Gemini gets one retry with what the test saw.
//
// The browser and Gemini are injected so this stays testable without either.
// ---------------------------------------------------------------------------

import { dropNulls, extractJsonObject, UNTRUSTED_PAGE_RULE } from './json.js';
import { parseSearchRecipe, type RecipeTestResult, type SearchRecipe } from './searchRecipe.js';
import type { PageCapture } from './teachProduct.js';

export interface TeachSourceInput {
  name: string;
  /** The shop's search URL with a {setNumber} placeholder. */
  urlTemplate: string;
  currency: string;
}

export interface TeachCapture {
  setNumber: string;
  url: string;
  html: string;
  title: string;
}

export interface TeachSearchDeps {
  capture(url: string, setNumber: string): Promise<PageCapture | null>;
  test(url: string, setNumber: string, recipe: SearchRecipe): Promise<RecipeTestResult>;
  /** Asks Gemini; resolves with the raw response text. */
  ask(prompt: string): Promise<string>;
}

export interface TeachSample {
  setNumber: string;
  result: RecipeTestResult | null;
}

export interface TeachSearchResult {
  /** Null when no attempt produced a usable recipe. */
  recipe: SearchRecipe | null;
  samples: TeachSample[];
  attempts: number;
  /** Plain-language reason when nothing usable came out. */
  error?: string;
}

export const MAX_TEACH_SAMPLES = 3;
const MAX_ATTEMPTS = 2;

export const sampleUrl = (urlTemplate: string, setNumber: string) =>
  urlTemplate.replace('{setNumber}', encodeURIComponent(setNumber));

const RECIPE_SHAPE = `{
  "resultSelector": "CSS selector matching each product in the result list",
  "titleSelector": "selector inside a result for the product name",
  "priceSelector": "selector inside a result for the current price",
  "linkSelector": "selector inside a result for the product link, or null",
  "decimalSeparator": "\\",\\" or \\".\\" or \\"auto\\"",
  "requireWord": "lego or null",
  "excludeTitlePattern": "case-insensitive JavaScript regex source, or null",
  "productPagePriceSelector": "selector on the product page for its price, or null",
  "consentSelector": "selector for the cookie banner's accept button, or null"
}`;

export function buildSearchTeachPrompt(source: TeachSourceInput, captures: TeachCapture[]): string {
  const parts = [
    'You write "recipes" that let a web scraper read LEGO set prices from an online shop\'s search results page.',
    `Shop: ${source.name}. Search URL template: ${source.urlTemplate} ({setNumber} is replaced by a LEGO set number). Prices are expected in ${source.currency}.`,
    `Below are simplified HTML captures of that search page for the set numbers ${captures.map((c) => c.setNumber).join(', ')}. Scripts, styles and most attributes were removed.`,
    '',
    `Return ONLY a JSON object of this shape:\n${RECIPE_SHAPE}`,
    '',
    'Rules:',
    '- resultSelector must match one element per product in the main result list, not navigation, banners, filters or recommendation carousels.',
    '- titleSelector, priceSelector and linkSelector are evaluated inside each result element. Every titleSelector match is joined with spaces and must give the product name, which normally contains the set number.',
    '- priceSelector must select the current selling price: not a crossed-out list price, a unit price, a monthly instalment or a shipping cost.',
    '- Prefer stable selectors: tag names, ids, data-* attributes and readable class names. Avoid auto-generated hashed class names such as "IBCrU4" or "css-1x2y3z".',
    '- decimalSeparator describes how prices are written on this page; use "auto" if unsure.',
    '- requireWord: "lego" if genuine product titles contain the word LEGO, otherwise null.',
    '- excludeTitlePattern: only if the results include accessories for LEGO sets (light kits, display cases, "compatible with"), a regex matching their titles; otherwise null.',
    '- productPagePriceSelector: only if some result items show no price but their product page would; otherwise null.',
    '- consentSelector: only if a cookie banner accept button appears in the HTML; otherwise null.',
    UNTRUSTED_PAGE_RULE,
  ];
  for (const c of captures) {
    parts.push('', `=== Capture for set ${c.setNumber} (page title: ${c.title.slice(0, 120)}; URL: ${c.url}) ===`, c.html);
  }
  return parts.join('\n');
}

export function buildSearchRetryPrompt(basePrompt: string, recipe: unknown, samples: TeachSample[]): string {
  const report = samples
    .map((s) => {
      const r = s.result;
      if (!r) return `- set ${s.setNumber}: page could not be loaded`;
      if (r.blocked) return `- set ${s.setNumber}: blocked by a bot check`;
      return (
        `- set ${s.setNumber}: ${r.cardsFound} result elements matched, ${r.matched} passed the title rules, price ${r.price ?? 'not found'}.` +
        (r.titles.length ? ` First results as read (price | title): ${r.titles.join(' || ')}` : '')
      );
    })
    .join('\n');
  return (
    `${basePrompt}\n\n` +
    `=== Your previous recipe ===\n${JSON.stringify(recipe)}\n` +
    `It was tested on the live pages and found no price:\n${report}\n` +
    'Write a corrected recipe. Return ONLY the JSON object.'
  );
}

export async function teachSearchPage(source: TeachSourceInput, setNumbers: string[], deps: TeachSearchDeps): Promise<TeachSearchResult> {
  const picked = setNumbers.slice(0, MAX_TEACH_SAMPLES);

  const captures: TeachCapture[] = [];
  for (const setNumber of picked) {
    const url = sampleUrl(source.urlTemplate, setNumber);
    const page = await deps.capture(url, setNumber).catch(() => null);
    if (page) captures.push({ setNumber, url: page.finalUrl || url, html: page.html, title: page.title });
  }
  if (captures.length === 0) {
    return {
      recipe: null,
      samples: picked.map((setNumber) => ({ setNumber, result: null })),
      attempts: 0,
      error: "The shop's search page could not be loaded. Check the URL template, or the shop may be blocking automated browsers.",
    };
  }

  const basePrompt = buildSearchTeachPrompt(source, captures);
  let prompt = basePrompt;
  let last: TeachSearchResult = { recipe: null, samples: [], attempts: 0 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const recipe = parseSearchRecipe(dropNulls(extractJsonObject(await deps.ask(prompt))));
    if (!recipe) {
      last = { recipe: null, samples: [], attempts: attempt, error: 'Gemini did not return a usable recipe.' };
      prompt = `${basePrompt}\n\nYour previous answer was not a valid recipe object. Return ONLY the JSON object with the required fields.`;
      continue;
    }

    const samples: TeachSample[] = [];
    for (const c of captures) {
      samples.push({ setNumber: c.setNumber, result: await deps.test(sampleUrl(source.urlTemplate, c.setNumber), c.setNumber, recipe).catch(() => null) });
    }
    last = { recipe, samples, attempts: attempt };
    if (samples.some((s) => s.result?.price != null)) return last;
    prompt = buildSearchRetryPrompt(basePrompt, recipe, samples);
  }

  return {
    ...last,
    error:
      last.error ??
      'The recipe found no prices for the sample sets. The shop may not sell them; try teaching again later or with other sets.',
  };
}
