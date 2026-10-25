# shop-teacher

Teach an app to read prices from any online shop, with Gemini writing the
instructions once. It also keeps one Gemini API key that every app on the
machine shares.

Used by BrickBudget (budget-tracker), Brick Tracker (lego-tracker) and BLOK.AI.

## How teaching works

A **recipe** says how to read prices from one shop's pages: CSS selectors for
the price (and the product name), how the shop writes decimals, and which
cookie-banner button to click. It is data, never code: a recipe can only
select elements and read their text, so a hostile shop page cannot trick the
model into writing something that runs on your computer.

1. The app's browser opens one of the shop's pages and captures a simplified
   copy (no scripts or styles, most attributes removed).
2. Gemini writes a recipe from that copy. The prompt tells it to treat the
   page as data, never as instructions.
3. The recipe is validated, then run on the live page. If it finds no price,
   Gemini gets one retry with what the test saw.
4. The app saves the recipe. From then on it reads prices with the recipe
   alone: no AI.

There are two kinds of price recipe:

| Kind | Reads | Used by |
| --- | --- | --- |
| Product page (`ProductRecipe`) | the price on one product's own page | BrickBudget wishlists |
| Search page (`SearchRecipe`) | a shop's search results for a LEGO set number, picking the set's own listing | Brick Tracker |

### Measure recipes (opt-in)

An app that also needs a product's size, as BLOK.AI does, can teach a shop
where its product pages give it, from `shop-teacher/measure`. Nothing else in
the package depends on it, and an app that never imports it never loads it:
the price recipes, their teaching and their prompts are as they were.

A `MeasureRecipe` holds a selector for the element giving the overall size
("140 x 46 x 84 cm", a specification row or table), or one selector each for
the width, depth and height; the unit of numbers written without one; and the
buttons to click first, a cookie banner and a collapsed specification tab. It
is taught like a product recipe, and kept only when, run on the live page, it
finds at least two of the three measures. `readMeasureRecipe` returns the
texts it read with the sizes `parseSizes` makes of them, in metres, so an app
can judge the texts with its own rules.

```ts
import { shopHost } from 'shop-teacher';
import { askGemini } from 'shop-teacher/gemini';
import { captureForSizes, readMeasureRecipe, teachMeasurePage } from 'shop-teacher/measure';

const result = await teachMeasurePage(shopHost(url)!, url, 'White sideboard', {
  capture: (u) => withPage(u, (page) => captureForSizes(page)),
  test: (u, recipe) => withPage(u, (page) => readMeasureRecipe(page, recipe)),
  ask: (prompt) => askGemini(prompt),
});
```

## The shared Gemini key

The key is kept in the OS credential store (Windows Credential Manager,
service `shop-teacher`), so a key entered in one app works in all of them.
`GEMINI_API_KEY` in the environment wins, for servers and CI.

```sh
npx shop-teacher key set      # asks for the key; nothing is echoed
npx shop-teacher key status
npx shop-teacher key test     # a tiny request with the key in use
npx shop-teacher key clear
```

Apps never hand the key to a renderer or a web page: they ask the main
process to call Gemini, and can only learn whether a key is set.

## Entry points

| Import | Runs in | Holds |
| --- | --- | --- |
| `shop-teacher` | anywhere (browser-safe) | recipes, `parseDisplayPrice`, `teachProductPage`, `teachSearchPage`, prompts |
| `shop-teacher/gemini` | Node / Electron main | `askGemini`, `getGeminiKey`, `setGeminiKey`, `clearGeminiKey`, `geminiKeyStatus`, `adoptGeminiKey` |
| `shop-teacher/browser` | Node, with the app's Playwright page | `capturePage`, `readProductRecipe`, `readSearchCards`, `readPagePrice`, `acceptConsent`, `isBlockedPage` |
| `shop-teacher/measure` | Node, with the app's Playwright page (opt-in) | `teachMeasurePage`, `readMeasureRecipe`, `captureForSizes`, `parseMeasureRecipe`, `parseSizes` |

Each app keeps its own browser, profile and page queue, and hands these
helpers an open page.

```ts
import { teachProductPage, shopHost } from 'shop-teacher';
import { askGemini } from 'shop-teacher/gemini';
import { capturePage, readProductRecipe } from 'shop-teacher/browser';

const result = await teachProductPage(shopHost(url)!, url, 'Sony WH-1000XM6', {
  capture: (u) => withPage(u, (page) => capturePage(page)),
  test: (u, recipe) => withPage(u, (page) => readProductRecipe(page, recipe)),
  ask: (prompt) => askGemini(prompt),
});
```

`askGemini` walks a list of models (`gemini-2.5-flash`, `gemini-2.5-flash-lite`,
`gemini-2.0-flash` by default). A rate-limited or unavailable model hands over to
the next, 503s are retried, and a rejected key stops at once. When every model
is rate limited it throws a `GeminiError` with `rateLimited` and `retryAfter`.

## Installing

Apps depend on a tagged release's tarball, straight from GitHub:

```json
"shop-teacher": "https://github.com/zgyorkei/shop-teacher/archive/refs/tags/v1.0.0.tar.gz"
```

The tarball needs no git and no SSH key (npm's `github:` shorthand tries SSH first, which
fails on build servers such as Vercel), and the lockfile pins its checksum.

`dist/` is committed, so installing needs no build step. After changing `src/`,
run `npm run check` (typecheck, tests, build), commit `dist/` with the change,
and tag a new version.
