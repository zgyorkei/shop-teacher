// ---------------------------------------------------------------------------
// Product-page recipes: how to read the price on one shop's product pages.
//
// A recipe is data, never code: CSS selectors and a number format. It can only
// select elements and read their text, so a hostile page cannot steer the model
// that writes it into producing something that runs on the user's computer.
// ---------------------------------------------------------------------------

import { isSelector } from './json.js';
import type { DecimalSeparator } from './price.js';

export interface ProductRecipe {
  version: 1;
  /** The current selling price (not a crossed-out list price, an instalment or shipping). */
  priceSelector: string;
  /** The product name, to show what the recipe read; optional. */
  titleSelector?: string;
  decimalSeparator: DecimalSeparator;
  /** Cookie-banner accept button, clicked when present. */
  consentSelector?: string;
  /** ISO 4217 code of the prices on the page, when known (e.g. "HUF"). */
  currency?: string;
}

/** What a product recipe read on a live page. */
export interface RecipeReading {
  price: number | null;
  /** The price text as found, e.g. "13 990 Ft". */
  priceText: string | null;
  title: string | null;
  /** Elements the price selector matched. */
  matches: number;
  /** The page was a bot check or an error page. */
  blocked: boolean;
  /** A selector the browser rejected. */
  error?: string;
}

/** Validates an untrusted recipe (from Gemini or storage): a clean copy with only known fields, or null. */
export function parseProductRecipe(raw: unknown): ProductRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isSelector(r.priceSelector)) return null;
  const decimalSeparator = r.decimalSeparator === ',' || r.decimalSeparator === '.' ? r.decimalSeparator : 'auto';
  const recipe: ProductRecipe = { version: 1, priceSelector: r.priceSelector.trim(), decimalSeparator };
  if (isSelector(r.titleSelector)) recipe.titleSelector = r.titleSelector.trim();
  if (isSelector(r.consentSelector)) recipe.consentSelector = r.consentSelector.trim();
  if (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency.trim().toUpperCase())) {
    recipe.currency = r.currency.trim().toUpperCase();
  }
  return recipe;
}

/** A page's shop: its host without "www.", e.g. "alza.hu"; recipes are kept per shop. */
export function shopHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
