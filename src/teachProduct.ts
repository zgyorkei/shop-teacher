// ---------------------------------------------------------------------------
// Teaching a shop's product pages: the app's browser captures one product page
// (simplified HTML), Gemini writes a product recipe from it, and the recipe is
// run on the same live page before anything is saved. If it finds no price,
// Gemini gets one retry with what the test saw.
//
// The browser and Gemini are injected, so this stays testable without either.
// ---------------------------------------------------------------------------

import { dropNulls, extractJsonObject, UNTRUSTED_PAGE_RULE } from './json.js';
import { parseProductRecipe, type ProductRecipe, type RecipeReading } from './productRecipe.js';

export interface PageCapture {
  html: string;
  title: string;
  finalUrl: string;
}

export interface TeachProductDeps {
  capture(url: string): Promise<PageCapture | null>;
  test(url: string, recipe: ProductRecipe): Promise<RecipeReading>;
  /** Asks Gemini; resolves with the raw response text. */
  ask(prompt: string): Promise<string>;
}

export interface TeachProductResult {
  /** Null when no attempt produced a recipe that found a price. */
  recipe: ProductRecipe | null;
  reading: RecipeReading | null;
  attempts: number;
  /** Plain-language reason when nothing usable came out. */
  error?: string;
}

const MAX_ATTEMPTS = 2;

const RECIPE_SHAPE = `{
  "priceSelector": "CSS selector for the product's current selling price",
  "titleSelector": "CSS selector for the product name, or null",
  "decimalSeparator": "\\",\\" or \\".\\" or \\"auto\\"",
  "consentSelector": "CSS selector for the cookie banner's accept button, or null",
  "currency": "ISO 4217 code of the prices shown, e.g. \\"HUF\\" or \\"EUR\\", or null"
}`;

export function buildProductTeachPrompt(shop: string, itemName: string, capture: PageCapture): string {
  return [
    'You write "recipes" that let a web scraper read the price of a product from an online shop\'s product page.',
    `Shop: ${shop}. The product is expected to be: ${itemName}.`,
    'Below is a simplified HTML capture of the product page. Scripts, styles and most attributes were removed.',
    '',
    `Return ONLY a JSON object of this shape:\n${RECIPE_SHAPE}`,
    '',
    'Rules:',
    '- priceSelector must select the current selling price of this product: not a crossed-out list price, a unit price, a monthly instalment, a shipping cost, or the price of a recommended or related product.',
    '- Prefer stable selectors: ids, itemprop and data-* attributes, readable class names. Avoid auto-generated hashed class names such as "IBCrU4" or "css-1x2y3z".',
    '- If several elements match, the first one must be the main price.',
    '- decimalSeparator describes how prices are written on this page; use "auto" if unsure.',
    '- consentSelector: only if a cookie banner accept button appears in the HTML; otherwise null.',
    UNTRUSTED_PAGE_RULE,
    '',
    `=== Capture (page title: ${capture.title.slice(0, 120)}; URL: ${capture.finalUrl}) ===`,
    capture.html,
  ].join('\n');
}

export function buildProductRetryPrompt(basePrompt: string, recipe: unknown, reading: RecipeReading | null): string {
  const report = !reading
    ? 'the page could not be loaded'
    : reading.blocked
      ? 'the page was blocked by a bot check'
      : reading.error
        ? `the browser rejected a selector: ${reading.error}`
        : `the price selector matched ${reading.matches} element(s); the first read as ${JSON.stringify(reading.priceText ?? '')}, which is not a price`;
  return `${basePrompt}\n\n=== Your previous recipe ===\n${JSON.stringify(recipe)}\nIt was tested on the live page and found no price: ${report}.\nWrite a corrected recipe. Return ONLY the JSON object.`;
}

/**
 * Teaches one shop from one of its product pages. `shop` names the shop in the
 * prompt (usually its host); `itemName` tells Gemini which product to look for.
 */
export async function teachProductPage(shop: string, url: string, itemName: string, deps: TeachProductDeps): Promise<TeachProductResult> {
  const capture = await deps.capture(url).catch(() => null);
  if (!capture) {
    return { recipe: null, reading: null, attempts: 0, error: "The shop's page could not be loaded; the shop may be blocking automated browsers." };
  }
  const basePrompt = buildProductTeachPrompt(shop, itemName, capture);
  let prompt = basePrompt;
  let last: TeachProductResult = { recipe: null, reading: null, attempts: 0 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const recipe = parseProductRecipe(dropNulls(extractJsonObject(await deps.ask(prompt))));
    if (!recipe) {
      last = { recipe: null, reading: null, attempts: attempt, error: 'Gemini did not return a usable recipe.' };
      prompt = `${basePrompt}\n\nYour previous answer was not a valid recipe object. Return ONLY the JSON object with the required fields.`;
      continue;
    }
    const reading = await deps.test(capture.finalUrl || url, recipe).catch(() => null);
    if (reading?.price != null) return { recipe, reading, attempts: attempt };
    last = { recipe: null, reading, attempts: attempt };
    prompt = buildProductRetryPrompt(basePrompt, recipe, reading);
  }
  return { ...last, error: last.error ?? 'The recipe found no price on the page. Try again later, or with another product page from this shop.' };
}
