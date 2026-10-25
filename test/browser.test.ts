import test from 'node:test';
import assert from 'node:assert/strict';
import { excerptAround, readPagePrice, readProductRecipe, type PageLike } from '../src/browser/index.ts';
import { parseProductRecipe } from '../src/index.ts';

/**
 * A stand-in page: evaluate() answers with `texts` for the price selector and
 * `name` for the title, as the in-page function would.
 */
function fakePage(options: { title?: string; texts?: string[]; name?: string; throws?: string }): PageLike {
  return {
    async evaluate(_fn: unknown, arg: any) {
      if (options.throws) throw new Error(options.throws);
      if (typeof arg === 'string') return options.texts ?? [];
      return { texts: options.texts ?? [], name: options.name ?? '' };
    },
    title: async () => options.title ?? 'Product',
    url: () => 'https://shop.example/p',
    locator: () => ({ first: () => ({ isVisible: async () => false, click: async () => {} }), count: async () => 0 }),
    waitForSelector: async () => null,
  } as PageLike;
}

const recipe = parseProductRecipe({ priceSelector: '.price', titleSelector: 'h1', decimalSeparator: ',' })!;

test('a product recipe reads the first text that is a price', async () => {
  const r = await readProductRecipe(fakePage({ texts: ['', 'Ingyenes', '13 990 Ft'], name: 'Sony WH' }), recipe);
  assert.deepEqual(r, { price: 13990, priceText: '13 990 Ft', title: 'Sony WH', matches: 3, blocked: false });
});

test('a product recipe reports bot checks and rejected selectors instead of throwing', async () => {
  assert.equal((await readProductRecipe(fakePage({ title: 'Just a moment...' }), recipe)).blocked, true);
  const bad = await readProductRecipe(fakePage({ throws: "Failed to execute 'querySelectorAll': '..' is not a valid selector.\nmore" }), recipe);
  assert.equal(bad.price, null);
  assert.match(bad.error!, /not a valid selector\.$/);
});

test('a product page price skips placeholders', async () => {
  assert.equal(await readPagePrice(fakePage({ texts: ['', '45,89 €'] }), '.p', 'auto'), 45.89);
  assert.equal(await readPagePrice(fakePage({ texts: ['n/a'] }), '.p', 'auto'), null);
});

test('captures are cut around the focus, within the limit', () => {
  const html = 'a'.repeat(1000) + 'PRICE 13 990 Ft' + 'b'.repeat(1000);
  assert.equal(excerptAround('short', 'x', 100), 'short');
  const cut = excerptAround(html, /\d[\d\s.,]*\s?Ft/, 200, 50);
  assert.equal(cut.length, 200);
  assert.ok(cut.includes('13 990 Ft'));
  assert.equal(excerptAround(html, 'not there', 200, 50), html.slice(0, 200), 'from the start when the focus is missing');
});
