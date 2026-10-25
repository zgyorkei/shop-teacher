// ---------------------------------------------------------------------------
// In-page helpers for an app's own browser (Playwright): the HTML capture that
// teaching sends to Gemini, and reading recipes on an open page. Each app keeps
// its own browser, profile and queue and hands these an open page.
//
// The functions passed to page.evaluate run inside the page, so they must not
// use anything from this module's scope.
// ---------------------------------------------------------------------------

import { parseDisplayPrice, type DecimalSeparator } from '../price.js';
import type { ProductRecipe, RecipeReading } from '../productRecipe.js';
import type { ScrapedCard, SearchRecipe } from '../searchRecipe.js';
import type { PageCapture } from '../teachProduct.js';

/** The parts of a Playwright Page these helpers use. */
export interface PageLike {
  evaluate<R, Arg>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
  title(): Promise<string>;
  url(): string;
  locator(selector: string): {
    first(): { isVisible(): Promise<boolean>; click(): Promise<unknown> };
    count(): Promise<number>;
  };
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
}

/**
 * Accept buttons of the common consent platforms. Pages being taught have no
 * recipe yet, so this lets the capture show the real page.
 */
export const GENERIC_CONSENT =
  '#onetrust-accept-btn-handler, #sp-cc-accept, #didomi-notice-agree-button, ' +
  'button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, .cmpboxbtnyes, [data-testid="uc-accept-all-button"]';

/** Size of the HTML excerpt handed to Gemini when teaching (~30k tokens). */
export const CAPTURE_MAX_CHARS = 110_000;

/** Where a product page's own price usually is: the first price-looking text. */
export const PRICE_TEXT = /\d[\d\s.,]*\s?(€|Ft|EUR|HUF|\$|£)|(€|\$|£)\s?\d/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for bot checks and error interstitials. */
export async function isBlockedPage(page: PageLike): Promise<boolean> {
  if (/just a moment|attention required|access denied|robot/i.test(await page.title().catch(() => ''))) return true;
  return (await page.locator('form[action*="validateCaptcha"], #challenge-form').count().catch(() => 0)) > 0;
}

/** Clicks a cookie banner's accept button when one is showing. */
export async function acceptConsent(page: PageLike, selector: string | undefined): Promise<void> {
  if (!selector) return;
  const button = page.locator(selector).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => {});
    await sleep(500);
  }
}

/** The page's body with scripts, styles and most attributes stripped and long texts cut. */
export function simplifiedHtml(page: PageLike): Promise<string> {
  return page.evaluate(() => {
    const root = document.body.cloneNode(true) as HTMLElement;
    root
      .querySelectorAll('script, style, noscript, svg, iframe, link, meta, template, video, canvas, source, picture')
      .forEach((el) => el.remove());
    const keep = /^(id|class|href|role|aria-label|itemprop|itemtype|data-[\w-]+|type|name|value|content|title|alt)$/;
    root.querySelectorAll('*').forEach((el) => {
      for (const a of Array.from(el.attributes)) {
        if (!keep.test(a.name)) el.removeAttribute(a.name);
        else if (a.value.length > 120) el.setAttribute(a.name, a.value.slice(0, 120));
      }
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ');
      n.textContent = t.length > 200 ? t.slice(0, 200) + '...' : t;
    }
    return root.innerHTML.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ');
  }, undefined);
}

/**
 * A window of at most `maxChars` around the first match of `focus` (a set
 * number, or a pattern such as PRICE_TEXT), starting `before` characters ahead
 * of it; the whole text when it is short enough.
 */
export function excerptAround(html: string, focus: string | RegExp, maxChars = CAPTURE_MAX_CHARS, before = 20_000): string {
  if (html.length <= maxChars) return html;
  const at = Math.max(0, typeof focus === 'string' ? html.indexOf(focus) : html.search(focus));
  const start = Math.max(0, Math.min(at - before, html.length - maxChars));
  return html.slice(start, start + maxChars);
}

/** The open page as teaching input: a compact HTML excerpt centred on `focus`, with its title and URL. */
export async function capturePage(
  page: PageLike,
  focus: string | RegExp = PRICE_TEXT,
  options: { maxChars?: number; before?: number } = {}
): Promise<PageCapture> {
  const html = excerptAround(await simplifiedHtml(page), focus, options.maxChars, options.before);
  return { html, title: await page.title(), finalUrl: page.url() };
}

/** Reads a product recipe on the open page; never throws (a rejected selector is reported in `error`). */
export async function readProductRecipe(page: PageLike, recipe: ProductRecipe): Promise<RecipeReading> {
  const reading: RecipeReading = { price: null, priceText: null, title: null, matches: 0, blocked: await isBlockedPage(page) };
  if (reading.blocked) return reading;
  await acceptConsent(page, recipe.consentSelector);
  await page.waitForSelector(recipe.priceSelector, { timeout: 8000 }).catch(() => {});
  try {
    const found = await page.evaluate(
      ({ price, title }) => {
        const texts = Array.from(document.querySelectorAll(price)).map((el) =>
          (el instanceof HTMLInputElement ? el.value : el.textContent || '').replace(/\s+/g, ' ').trim()
        );
        const name = title
          ? Array.from(document.querySelectorAll(title)).map((el) => el.textContent || '').join(' ').replace(/\s+/g, ' ').trim()
          : '';
        return { texts: texts.slice(0, 10), name };
      },
      { price: recipe.priceSelector, title: recipe.titleSelector ?? null }
    );
    reading.matches = found.texts.length;
    reading.title = found.name || null;
    // The first text that reads as a price: some shops start with an empty placeholder.
    for (const text of found.texts) {
      const price = parseDisplayPrice(text, recipe.decimalSeparator);
      if (price != null) {
        reading.price = price;
        reading.priceText = text;
        break;
      }
    }
    if (reading.price == null) reading.priceText = found.texts[0] || null;
  } catch (err: any) {
    // A taught recipe can carry a selector the browser rejects outright.
    reading.error = String(err?.message ?? err).split('\n')[0].slice(0, 160);
  }
  return reading;
}

/**
 * The product cards of a search page as the recipe reads them (at most 60).
 * Throws when the browser rejects one of the recipe's selectors.
 */
export function readSearchCards(page: PageLike, recipe: SearchRecipe): Promise<ScrapedCard[]> {
  return page.evaluate(
    (sel) =>
      Array.from(document.querySelectorAll(sel.result))
        .slice(0, 60)
        .map((n) => ({
          // Every match is joined: some layouts split brand and title.
          title: Array.from(n.querySelectorAll(sel.title))
            .map((el) => el.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
          priceText: n.querySelector(sel.price)?.textContent?.trim() || null,
          href: sel.link ? n.querySelector(sel.link)?.getAttribute('href') || null : null,
        })),
    { result: recipe.resultSelector, title: recipe.titleSelector, price: recipe.priceSelector, link: recipe.linkSelector ?? null }
  );
}

/**
 * A product page's price from `selector`: the first match that reads as a
 * price (the first is often an empty placeholder; form fields such as
 * Amazon's hidden price input carry it in their value). Null when none does.
 */
export async function readPagePrice(page: PageLike, selector: string, decimalSeparator: DecimalSeparator): Promise<number | null> {
  const texts = await page
    .evaluate(
      (sel) => Array.from(document.querySelectorAll(sel)).map((el) => (el instanceof HTMLInputElement ? el.value : el.textContent || '')),
      selector
    )
    .catch(() => [] as string[]);
  for (const text of texts) {
    const price = parseDisplayPrice(text, decimalSeparator);
    if (price != null) return price;
  }
  return null;
}
