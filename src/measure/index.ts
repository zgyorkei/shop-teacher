// ---------------------------------------------------------------------------
// Measure recipes: how to read a product's overall size (width, depth, height)
// from one shop's product pages, taught the way prices are. Opt-in: nothing in
// the price recipes, their teaching or their prompts depends on this module,
// and an app that never imports "shop-teacher/measure" never loads it.
//
// A recipe is data, never code: CSS selectors, a unit, and buttons to click
// (a cookie banner, a collapsed specification tab). It can only select
// elements, click them and read their text.
// ---------------------------------------------------------------------------

import { acceptConsent, capturePage, isBlockedPage, type PageLike } from '../browser/index.js';
import { dropNulls, extractJsonObject, isSelector, UNTRUSTED_PAGE_RULE } from '../json.js';
import type { PageCapture } from '../teachProduct.js';

export type LengthUnit = 'mm' | 'cm' | 'm';
export type Axis = 'width' | 'depth' | 'height';
export const AXES: Axis[] = ['width', 'depth', 'height'];

export interface MeasureRecipe {
  version: 1;
  /** The element(s) whose text gives the product's overall size: a specification row or table, a "Dimensions" section, a line of the description. */
  sizeSelector?: string;
  /** One element per measure, where the page gives each in a row of its own. */
  widthSelector?: string;
  depthSelector?: string;
  heightSelector?: string;
  /** The unit of numbers written without one. */
  unit: LengthUnit;
  /** A tab, accordion or "more" button to click first, when the sizes are hidden behind it. */
  revealSelector?: string;
  /** Cookie-banner accept button, clicked when present. */
  consentSelector?: string;
}

/** What a measure recipe read on a live page; sizes in metres. */
export interface MeasureReading {
  width: number | null;
  depth: number | null;
  height: number | null;
  /** The texts read, the size selector's first, for the app's own reading. */
  texts: string[];
  /** The text each measure was read from. */
  evidence: Partial<Record<Axis, string>>;
  /** Elements the recipe's selectors matched. */
  matches: number;
  /** The page was a bot check or an error page. */
  blocked: boolean;
  /** A selector the browser rejected. */
  error?: string;
}

const isUnit = (v: unknown): v is LengthUnit => v === 'mm' || v === 'cm' || v === 'm';

/** Validates an untrusted recipe (from Gemini or storage): a clean copy with only known fields, or null. */
export function parseMeasureRecipe(raw: unknown): MeasureRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const recipe: MeasureRecipe = { version: 1, unit: isUnit(r.unit) ? r.unit : 'cm' };
  for (const key of ['sizeSelector', 'widthSelector', 'depthSelector', 'heightSelector', 'revealSelector', 'consentSelector'] as const) {
    if (isSelector(r[key])) recipe[key] = (r[key] as string).trim();
  }
  // A button found by its words is clicked through the app's browser, whose selectors say ":has-text"; jQuery's ":contains" it does not know.
  for (const key of ['revealSelector', 'consentSelector'] as const) {
    if (recipe[key]) recipe[key] = recipe[key]!.replace(/:contains\(/g, ':has-text(');
  }
  // A size to read: the overall size's element, or two of the three measures' own.
  const axes = [recipe.widthSelector, recipe.depthSelector, recipe.heightSelector].filter(Boolean).length;
  return recipe.sizeSelector || axes >= 2 ? recipe : null;
}

// ---------------------------------------------------------------------------
// Reading sizes out of text
// ---------------------------------------------------------------------------

/** The labels a shop gives each measure, in English, Hungarian, German, French, Italian and Spanish. */
const LABELS: Record<Axis, RegExp> = {
  width: /\b(width|wide|szélesség|szelesseg|széles|breite|largeur|larghezza|anchura|ancho|length|hosszúság|hosszusag|hossz|länge|longueur|lunghezza|longitud)\b/i,
  depth: /\b(depth|deep|mélység|melyseg|tiefe|profondeur|profondità|profondita|profundidad|fondo)\b/i,
  height: /\b(height|high|tall|magasság|magassag|höhe|hohe|hauteur|altezza|altura)\b/i,
};

const NUMBER = /(\d+(?:[.,]\d+)?)/;
const UNIT = /\s*(mm|cm|m)\b/i;

function toMetres(value: string, unit: string | undefined, fallback: LengthUnit): number | null {
  const n = parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = (unit?.toLowerCase() as LengthUnit | undefined) ?? fallback;
  const metres = u === 'mm' ? n / 1000 : u === 'cm' ? n / 100 : n;
  // A piece of furniture or equipment: a centimetre to thirty metres.
  return metres >= 0.01 && metres <= 30 ? Math.round(metres * 10000) / 10000 : null;
}

/**
 * The sizes a text gives: three numbers multiplied out read as width × depth ×
 * height ("140 x 46 x 84 cm"), else each measure by its label ("Width: 140
 * cm", "Magasság 84 cm"), else two numbers as width × height. Numbers without
 * a unit are in `unit`. Metres; a measure not found is left out.
 */
export function parseSizes(text: string, unit: LengthUnit = 'cm'): Partial<Record<Axis, number>> {
  const clean = String(text ?? '').replace(/\s+/g, ' ');
  // Multiplied out first: "Width x Depth x Height: 140 x 46 x 84 cm" would give each label the first number.
  const sep = '\\s*[x×*]\\s*';
  const triple = clean.match(new RegExp(`${NUMBER.source}(?:${UNIT.source})?${sep}${NUMBER.source}(?:${UNIT.source})?${sep}${NUMBER.source}(?:${UNIT.source})?`, 'i'));
  if (triple) {
    const unitOf = triple[6] ?? triple[4] ?? triple[2];
    const [w, d, h] = [triple[1], triple[3], triple[5]].map((v) => toMetres(v, unitOf, unit));
    if (w !== null && d !== null && h !== null) return { width: w, depth: d, height: h };
  }
  const found: Partial<Record<Axis, number>> = {};
  for (const axis of AXES) {
    const label = clean.match(new RegExp(`${LABELS[axis].source}[^\\d]{0,20}?${NUMBER.source}(?:${UNIT.source})?`, 'i'));
    if (label) {
      const value = toMetres(label[2], label[3], unit);
      if (value !== null) found[axis] = value;
    }
  }
  if (Object.keys(found).length >= 2) return found;
  const pair = clean.match(new RegExp(`${NUMBER.source}(?:${UNIT.source})?${sep}${NUMBER.source}(?:${UNIT.source})?`, 'i'));
  if (pair && Object.keys(found).length === 0) {
    const unitOf = pair[4] ?? pair[2];
    const [w, h] = [pair[1], pair[3]].map((v) => toMetres(v, unitOf, unit));
    if (w !== null && h !== null) return { width: w, height: h };
  }
  return found;
}

// ---------------------------------------------------------------------------
// On the page
// ---------------------------------------------------------------------------

/** Where a product page's size usually is: a dimensions label, or numbers multiplied out. */
export const SIZE_TEXT = /\d+(?:[.,]\d+)?\s*(?:cm|mm)?\s*[x×]\s*\d|méretek|méret|dimensions|abmessungen|maße|dimensioni|medidas|szélesség|magasság|width|height/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The open page as teaching input, centred on where its size is written. */
export function captureForSizes(page: PageLike, options: { maxChars?: number; before?: number } = {}): Promise<PageCapture> {
  return capturePage(page, SIZE_TEXT, options);
}

/** Reads a measure recipe on the open page; never throws (a rejected selector is reported in `error`). */
export async function readMeasureRecipe(page: PageLike, recipe: MeasureRecipe): Promise<MeasureReading> {
  const reading: MeasureReading = { width: null, depth: null, height: null, texts: [], evidence: {}, matches: 0, blocked: await isBlockedPage(page) };
  if (reading.blocked) return reading;
  await acceptConsent(page, recipe.consentSelector);
  if (recipe.revealSelector) {
    const button = page.locator(recipe.revealSelector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await sleep(700);
    }
  }
  const first = recipe.sizeSelector ?? recipe.widthSelector ?? recipe.heightSelector ?? recipe.depthSelector!;
  await page.waitForSelector(first, { timeout: 8000 }).catch(() => {});
  try {
    const found = await page.evaluate(
      (sel) => {
        const read = (selector: string | null) =>
          selector
            ? Array.from(document.querySelectorAll(selector))
                .slice(0, 10)
                .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400))
                .filter(Boolean)
            : [];
        return { size: read(sel.size), width: read(sel.width), depth: read(sel.depth), height: read(sel.height) };
      },
      { size: recipe.sizeSelector ?? null, width: recipe.widthSelector ?? null, depth: recipe.depthSelector ?? null, height: recipe.heightSelector ?? null }
    );
    reading.matches = found.size.length + found.width.length + found.depth.length + found.height.length;
    reading.texts = [...found.size, ...found.width, ...found.depth, ...found.height];
    // Each measure from its own element first, then from the overall size's text.
    for (const axis of AXES) {
      for (const text of found[axis]) {
        const value = parseSizes(/\d/.test(text) && !LABELS[axis].test(text) ? `${axis} ${text}` : text, recipe.unit)[axis];
        if (value !== undefined) {
          reading[axis] = value;
          reading.evidence[axis] = text;
          break;
        }
      }
    }
    for (const text of found.size) {
      const sizes = parseSizes(text, recipe.unit);
      for (const axis of AXES) {
        if (reading[axis] === null && sizes[axis] !== undefined) {
          reading[axis] = sizes[axis]!;
          reading.evidence[axis] = text;
        }
      }
      if (AXES.every((axis) => reading[axis] !== null)) break;
    }
  } catch (err: any) {
    reading.error = String(err?.message ?? err).split('\n')[0].slice(0, 160);
  }
  return reading;
}

/** How many of the three measures a reading has. */
export const measuresFound = (reading: Pick<MeasureReading, Axis> | null): number => (reading ? AXES.filter((axis) => reading[axis] !== null).length : 0);

// ---------------------------------------------------------------------------
// Teaching
// ---------------------------------------------------------------------------

export interface TeachMeasureDeps {
  capture(url: string): Promise<PageCapture | null>;
  /** Runs the recipe on the live page. An app may judge the texts with its own size rules and fill the measures itself. */
  test(url: string, recipe: MeasureRecipe): Promise<MeasureReading>;
  /** Asks Gemini; resolves with the raw response text. */
  ask(prompt: string): Promise<string>;
}

export interface TeachMeasureResult {
  /** Null when no attempt produced a recipe that found at least two of the three measures. */
  recipe: MeasureRecipe | null;
  reading: MeasureReading | null;
  attempts: number;
  /** Plain-language reason when nothing usable came out. */
  error?: string;
}

const MAX_ATTEMPTS = 2;

const RECIPE_SHAPE = `{
  "sizeSelector": "CSS selector for the element(s) whose text gives the product's overall size, or null",
  "widthSelector": "CSS selector for the element giving the width alone, or null",
  "depthSelector": "CSS selector for the element giving the depth alone, or null",
  "heightSelector": "CSS selector for the element giving the height alone, or null",
  "unit": "\\"mm\\", \\"cm\\" or \\"m\\": the unit of numbers written without one",
  "revealSelector": "CSS selector for a tab, accordion or 'more' button that must be clicked to show the sizes, or null",
  "consentSelector": "CSS selector for the cookie banner's accept button, or null"
}`;

export function buildMeasureTeachPrompt(shop: string, itemName: string, capture: PageCapture): string {
  return [
    'You write "recipes" that let a web scraper read the overall size of a product (its width, depth and height) from an online shop\'s product page.',
    `Shop: ${shop}. The product is expected to be: ${itemName}.`,
    'Below is a simplified HTML capture of the product page. Scripts, styles and most attributes were removed.',
    '',
    `Return ONLY a JSON object of this shape:\n${RECIPE_SHAPE}`,
    '',
    'Rules:',
    '- Select where the product itself is measured as a whole, assembled: a specification row or table ("Dimensions", "Méretek", "Maße"), or the line of the description that gives its size.',
    '- Not the size of the packaging or the parcel, of one part or an accessory, of a compartment or a drawer, a seat height, a weight, or a screen diagonal.',
    '- If the page gives width, depth and height in rows of their own, give a selector for each; otherwise give sizeSelector for the element holding them together, e.g. "140 x 46 x 84 cm".',
    '- Prefer stable selectors: ids, itemprop and data-* attributes, readable class names. Avoid auto-generated hashed class names such as "IBCrU4" or "css-1x2y3z".',
    '- Make each selector as narrow as possible, so its text holds the measure and little else; the first match must be the product\'s own.',
    '- Use standard CSS that document.querySelectorAll accepts: no :contains() or other jQuery extensions.',
    '- revealSelector: only if the sizes sit in a collapsed tab or section that a click opens; otherwise null.',
    '- consentSelector: only if a cookie banner accept button appears in the HTML; otherwise null.',
    UNTRUSTED_PAGE_RULE,
    '',
    `=== Capture (page title: ${capture.title.slice(0, 120)}; URL: ${capture.finalUrl}) ===`,
    capture.html,
  ].join('\n');
}

export function buildMeasureRetryPrompt(basePrompt: string, recipe: unknown, reading: MeasureReading | null): string {
  const report = !reading
    ? 'the page could not be loaded'
    : reading.blocked
      ? 'the page was blocked by a bot check'
      : reading.error
        ? `the browser rejected a selector: ${reading.error}`
        : reading.matches === 0
          ? 'the selectors matched nothing'
          : `the selectors matched ${reading.matches} element(s) reading ${JSON.stringify(reading.texts.slice(0, 3))}, which give ${measuresFound(reading)} of the three measures`;
  return `${basePrompt}\n\n=== Your previous recipe ===\n${JSON.stringify(recipe)}\nIt was tested on the live page and did not find the product's size: ${report}.\nWrite a corrected recipe. Return ONLY the JSON object.`;
}

/**
 * Teaches one shop's sizes from one of its product pages: a recipe is kept
 * only when, run on the live page, it finds at least two of the three measures.
 */
export async function teachMeasurePage(shop: string, url: string, itemName: string, deps: TeachMeasureDeps): Promise<TeachMeasureResult> {
  const capture = await deps.capture(url).catch(() => null);
  if (!capture) {
    return { recipe: null, reading: null, attempts: 0, error: "The shop's page could not be loaded; the shop may be blocking automated browsers." };
  }
  const basePrompt = buildMeasureTeachPrompt(shop, itemName, capture);
  let prompt = basePrompt;
  let last: TeachMeasureResult = { recipe: null, reading: null, attempts: 0 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const recipe = parseMeasureRecipe(dropNulls(extractJsonObject(await deps.ask(prompt))));
    if (!recipe) {
      last = { recipe: null, reading: null, attempts: attempt, error: 'Gemini did not return a usable recipe.' };
      prompt = `${basePrompt}\n\nYour previous answer was not a valid recipe object. Return ONLY the JSON object, with sizeSelector or at least two of the measures' own selectors.`;
      continue;
    }
    const reading = await deps.test(capture.finalUrl || url, recipe).catch(() => null);
    if (measuresFound(reading) >= 2) return { recipe, reading, attempts: attempt };
    last = { recipe: null, reading, attempts: attempt };
    prompt = buildMeasureRetryPrompt(basePrompt, recipe, reading);
  }
  return { ...last, error: last.error ?? "The recipe did not find the product's size on the page. Try again with another product page from this shop." };
}
