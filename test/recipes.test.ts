import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDisplayPrice,
  parseProductRecipe,
  parseSearchRecipe,
  rankCards,
  shopHost,
  titleMatchScore,
  type DecimalSeparator,
  type SearchRecipe,
} from '../src/index.ts';

test('display prices in shop formats', () => {
  const cases: [string, DecimalSeparator, number][] = [
    ['53,35 €', ',', 53.35],
    ['1.234,56 €', ',', 1234.56],
    ['14 998 Ft-tól', ',', 14998],
    ['14 998 Ft', ',', 14998],
    ['13 990 Ft', ',', 13990],
    ['€1,234.56', '.', 1234.56],
    // auto: the format follows the shop's UI language
    ['€45.89', 'auto', 45.89],
    ['45,89 €', 'auto', 45.89],
    ['1.234 €', 'auto', 1234],
    ['€1,234', 'auto', 1234],
    ['1.234,56 €', 'auto', 1234.56],
    ['HUF33,371.67', 'auto', 33371.67],
    ['33371.67', 'auto', 33371.67],
  ];
  for (const [text, sep, expected] of cases) assert.equal(parseDisplayPrice(text, sep), expected, `${text} (${sep})`);
  assert.equal(parseDisplayPrice('€45.89'), 45.89, 'auto by default');
  assert.equal(parseDisplayPrice(' ', 'auto'), null);
  assert.equal(parseDisplayPrice('See options', ','), null);
  assert.equal(parseDisplayPrice(null), null);
  assert.equal(parseDisplayPrice('0 Ft'), null, 'zero is not a price');
});

test('product recipes from the model are validated: known fields only, sane selectors', () => {
  assert.deepEqual(parseProductRecipe({ priceSelector: ' .price-box .current ', decimalSeparator: ',', currency: 'huf', script: 'alert(1)' }), {
    version: 1,
    priceSelector: '.price-box .current',
    decimalSeparator: ',',
    currency: 'HUF',
  });
  assert.equal(parseProductRecipe({ decimalSeparator: ',' }), null, 'a price selector is required');
  assert.equal(parseProductRecipe({ priceSelector: 'x'.repeat(301) }), null, 'no endless selectors');
  assert.equal(parseProductRecipe('nope'), null);
  assert.equal(parseProductRecipe({ priceSelector: '.p', decimalSeparator: 'weird' })!.decimalSeparator, 'auto');
  assert.equal(parseProductRecipe({ priceSelector: '.p', currency: 'euros' })!.currency, undefined);
  assert.equal(shopHost('https://www.alza.hu/x?y'), 'alza.hu');
  assert.equal(shopHost('not a url'), null);
});

test('set numbers in titles: where they sit says whether it is the set itself', () => {
  const cases: [string, string, number][] = [
    ['LEGO Icons Bürgermeistervilla 11383', '11383', 2],
    ['LEGO® Creator 3-in-1 - Erdei állatok: Szürke farkas (31393)', '31393', 2],
    ['LEGO City 60488 Chip Truck', '60488', 2],
    ["LEGO Icons 11383 Mayor's Villa", '11383', 2],
    ['LEGO Building Set, 10305', '10305', 2],
    ['LED Light Set Compatible with Lego 10305 Lion Knight Castle (Not Model), Remote Control', '10305', 1],
    ['Beline tok Xiaomi Poco F6 (313939)', '31393', 0],
    ['LEGO City Burger-Truck 60404', '60488', 0],
  ];
  for (const [title, num, expected] of cases) assert.equal(titleMatchScore(title, num), expected, title);
});

const searchRecipe: SearchRecipe = {
  version: 1,
  resultSelector: 'x',
  titleSelector: 'x',
  priceSelector: 'x',
  decimalSeparator: 'auto',
  requireWord: 'lego',
  excludeTitlePattern: 'compatible|\\bled\\b',
};

test('search results: the cheapest strong match, without add-ons and unrelated products', () => {
  const ranked = rankCards(
    [
      { title: 'Kanlux Grun 31393', priceText: '3 968 Ft', href: null },
      { title: 'LocoLee Light Kit Compatible with LEGO 31393', priceText: '€21.00', href: null },
      { title: 'LEGO Creator Forest Animals: Wolf 31393', priceText: '€53.35', href: '/a' },
      { title: 'LEGO Creator Wolf 31393', priceText: '€51.00', href: '/b' },
    ],
    '31393',
    searchRecipe
  );
  assert.deepEqual(ranked.map((c) => c.href), ['/b', '/a']);
});

test('search results: no falling through to a weaker match when the set itself has no price', () => {
  const ranked = rankCards(
    [
      { title: 'LEGO Building Set, 10305', priceText: null, href: '/set' },
      { title: 'LEGO Knight Figures Falcon Knights, minifigures from set 10305 and others', priceText: '€39.47', href: '/pack' },
    ],
    '10305',
    searchRecipe
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].href, '/set');
  assert.equal(ranked[0].price, null);
});

test('search recipes are validated', () => {
  const base = { resultSelector: 'div.card', titleSelector: 'h2', priceSelector: '.price', decimalSeparator: ',' };
  assert.deepEqual(parseSearchRecipe({ ...base, onload: 'alert(1)', requireWord: 'lego' }), { version: 1, ...base, requireWord: 'lego' });
  assert.equal(parseSearchRecipe({ ...base, priceSelector: '' }), null);
  assert.equal(parseSearchRecipe({ ...base, decimalSeparator: ';' }), null);
  assert.equal(parseSearchRecipe({ ...base, excludeTitlePattern: '(' }), null);
  assert.equal(parseSearchRecipe(null), null);
  const r = parseSearchRecipe({
    ...base,
    cookies: [
      { name: 'i18n-prefs', value: 'EUR', domain: '.amazon.de' },
      { name: 'bad name', value: 'x', domain: 'y' },
    ],
  });
  assert.deepEqual(r?.cookies, [{ name: 'i18n-prefs', value: 'EUR', domain: '.amazon.de' }]);
});
