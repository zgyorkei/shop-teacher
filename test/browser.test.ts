import test from 'node:test';
import assert from 'node:assert/strict';
import { excerptAround, readPagePrice, readProductRecipe, readSearchCards, type PageLike } from '../src/browser/index.ts';
import { parseProductRecipe, parseSearchRecipe, pickCardImage } from '../src/index.ts';

test('a card image prefers what the browser chose and skips placeholders', () => {
  const base = 'https://www.amazon.de/s?k=lego';
  assert.equal(
    pickCardImage({ current: 'https://m.media-amazon.com/I/a._UL480_.jpg', src: 'https://m.media-amazon.com/I/a._UL320_.jpg' }, base),
    'https://m.media-amazon.com/I/a._UL480_.jpg'
  );
  assert.equal(pickCardImage({ current: '', src: 'data:image/gif;base64,R0lGOD', dataSrc: '/img/real.jpg' }, base), 'https://www.amazon.de/img/real.jpg');
  assert.equal(pickCardImage({ src: '/static/blank.gif', srcset: 'https://x.test/big.jpg 2x, https://x.test/small.jpg 1x' }, base), 'https://x.test/big.jpg');
  assert.equal(pickCardImage({ src: 'javascript:alert(1)' }, base), null);
  assert.equal(pickCardImage(null, base), null);
});

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

test('search cards carry their image as an absolute URL', async () => {
  const page = {
    ...fakePage({}),
    url: () => 'https://www.arukereso.hu/CategorySearch.php?st=633412',
    async evaluate() {
      return [
        { title: 'LEGO 633412 (633412)', priceText: '9 990 Ft', href: '/p/1', rawImage: { current: '', src: '//p1.akcdn.net/thumb/1.jpg' } },
        { title: 'No image', priceText: null, href: null, rawImage: null },
      ];
    },
  } as unknown as PageLike;
  const cards = await readSearchCards(page, parseSearchRecipe({ resultSelector: 'div', titleSelector: 'h2', priceSelector: '.p', decimalSeparator: ',' })!);
  assert.deepEqual(cards, [
    { title: 'LEGO 633412 (633412)', priceText: '9 990 Ft', href: '/p/1', image: 'https://p1.akcdn.net/thumb/1.jpg' },
    { title: 'No image', priceText: null, href: null, image: null },
  ]);
});

test('captures are cut around the focus, within the limit', () => {
  const html = 'a'.repeat(1000) + 'PRICE 13 990 Ft' + 'b'.repeat(1000);
  assert.equal(excerptAround('short', 'x', 100), 'short');
  const cut = excerptAround(html, /\d[\d\s.,]*\s?Ft/, 200, 50);
  assert.equal(cut.length, 200);
  assert.ok(cut.includes('13 990 Ft'));
  assert.equal(excerptAround(html, 'not there', 200, 50), html.slice(0, 200), 'from the start when the focus is missing');
});
