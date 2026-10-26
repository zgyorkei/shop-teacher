"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/browser/index.ts
var browser_exports = {};
__export(browser_exports, {
  CAPTURE_MAX_CHARS: () => CAPTURE_MAX_CHARS,
  GENERIC_CONSENT: () => GENERIC_CONSENT,
  PRICE_TEXT: () => PRICE_TEXT,
  acceptConsent: () => acceptConsent,
  capturePage: () => capturePage,
  excerptAround: () => excerptAround,
  isBlockedPage: () => isBlockedPage,
  readPagePrice: () => readPagePrice,
  readProductRecipe: () => readProductRecipe,
  readSearchCards: () => readSearchCards,
  simplifiedHtml: () => simplifiedHtml
});
module.exports = __toCommonJS(browser_exports);

// src/price.ts
function parseDisplayPrice(text, decimalSeparator = "auto") {
  const compact = String(text ?? "").replace(/[\s  ]/g, "");
  const m = compact.match(/\d[\d.,]*/);
  if (!m) return null;
  let num = m[0].replace(/[.,]$/, "");
  let sep = decimalSeparator;
  if (sep === "auto") {
    const last = Math.max(num.lastIndexOf(","), num.lastIndexOf("."));
    const isDecimal = last >= 0 && num.length - last - 1 === 2;
    sep = isDecimal ? num[last] : num.includes(",") ? "." : ",";
  }
  num = sep === "," ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  const value = parseFloat(num);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// src/searchRecipe.ts
var PLACEHOLDER_IMAGE = /(spacer|blank|pixel|placeholder|transparent|loading|grey|gray)\.(gif|png|svg|jpe?g)(\?|$)/i;
function pickCardImage(raw, baseUrl) {
  if (!raw) return null;
  const firstSrcset = raw.srcset?.split(",")[0]?.trim().split(/\s+/)[0] ?? null;
  for (const candidate of [raw.current, raw.src, raw.dataSrc, firstSrcset]) {
    if (!candidate || /^(data|blob):/i.test(candidate) || PLACEHOLDER_IMAGE.test(candidate)) continue;
    try {
      const url = new URL(candidate, baseUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
    }
  }
  return null;
}

// src/browser/index.ts
var GENERIC_CONSENT = '#onetrust-accept-btn-handler, #sp-cc-accept, #didomi-notice-agree-button, button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, .cmpboxbtnyes, [data-testid="uc-accept-all-button"]';
var CAPTURE_MAX_CHARS = 11e4;
var PRICE_TEXT = /\d[\d\s.,]*\s?(€|Ft|EUR|HUF|\$|£)|(€|\$|£)\s?\d/;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function isBlockedPage(page) {
  if (/just a moment|attention required|access denied|robot/i.test(await page.title().catch(() => ""))) return true;
  return await page.locator('form[action*="validateCaptcha"], #challenge-form').count().catch(() => 0) > 0;
}
async function acceptConsent(page, selector) {
  if (!selector) return;
  const button = page.locator(selector).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => {
    });
    await sleep(500);
  }
}
function simplifiedHtml(page) {
  return page.evaluate(() => {
    const root = document.body.cloneNode(true);
    root.querySelectorAll("script, style, noscript, svg, iframe, link, meta, template, video, canvas, source, picture").forEach((el) => el.remove());
    const keep = /^(id|class|href|role|aria-label|itemprop|itemtype|data-[\w-]+|type|name|value|content|title|alt)$/;
    root.querySelectorAll("*").forEach((el) => {
      for (const a of Array.from(el.attributes)) {
        if (!keep.test(a.name)) el.removeAttribute(a.name);
        else if (a.value.length > 120) el.setAttribute(a.name, a.value.slice(0, 120));
      }
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || "").replace(/\s+/g, " ");
      n.textContent = t.length > 200 ? t.slice(0, 200) + "..." : t;
    }
    return root.innerHTML.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ");
  }, void 0);
}
function excerptAround(html, focus, maxChars = CAPTURE_MAX_CHARS, before = 2e4) {
  if (html.length <= maxChars) return html;
  const at = Math.max(0, typeof focus === "string" ? html.indexOf(focus) : html.search(focus));
  const start = Math.max(0, Math.min(at - before, html.length - maxChars));
  return html.slice(start, start + maxChars);
}
async function capturePage(page, focus = PRICE_TEXT, options = {}) {
  const html = excerptAround(await simplifiedHtml(page), focus, options.maxChars, options.before);
  return { html, title: await page.title(), finalUrl: page.url() };
}
async function readProductRecipe(page, recipe) {
  const reading = { price: null, priceText: null, title: null, matches: 0, blocked: await isBlockedPage(page) };
  if (reading.blocked) return reading;
  await acceptConsent(page, recipe.consentSelector);
  await page.waitForSelector(recipe.priceSelector, { timeout: 8e3 }).catch(() => {
  });
  try {
    const found = await page.evaluate(
      ({ price, title }) => {
        const texts = Array.from(document.querySelectorAll(price)).map(
          (el) => (el instanceof HTMLInputElement ? el.value : el.textContent || "").replace(/\s+/g, " ").trim()
        );
        const name = title ? Array.from(document.querySelectorAll(title)).map((el) => el.textContent || "").join(" ").replace(/\s+/g, " ").trim() : "";
        return { texts: texts.slice(0, 10), name };
      },
      { price: recipe.priceSelector, title: recipe.titleSelector ?? null }
    );
    reading.matches = found.texts.length;
    reading.title = found.name || null;
    for (const text of found.texts) {
      const price = parseDisplayPrice(text, recipe.decimalSeparator);
      if (price != null) {
        reading.price = price;
        reading.priceText = text;
        break;
      }
    }
    if (reading.price == null) reading.priceText = found.texts[0] || null;
  } catch (err) {
    reading.error = String(err?.message ?? err).split("\n")[0].slice(0, 160);
  }
  return reading;
}
async function readSearchCards(page, recipe) {
  const cards = await page.evaluate(
    (sel) => Array.from(document.querySelectorAll(sel.result)).slice(0, 60).map((n) => {
      const img = n.querySelector("img");
      return {
        // Every match is joined: some layouts split brand and title.
        title: Array.from(n.querySelectorAll(sel.title)).map((el) => el.textContent || "").join(" ").replace(/\s+/g, " ").trim(),
        priceText: n.querySelector(sel.price)?.textContent?.trim() || null,
        href: sel.link ? n.querySelector(sel.link)?.getAttribute("href") || null : null,
        // Raw attributes only; the URL is picked outside the page.
        rawImage: img ? {
          current: img.currentSrc || null,
          src: img.getAttribute("src"),
          dataSrc: img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original"),
          srcset: img.getAttribute("srcset") || img.getAttribute("data-srcset")
        } : null
      };
    }),
    { result: recipe.resultSelector, title: recipe.titleSelector, price: recipe.priceSelector, link: recipe.linkSelector ?? null }
  );
  const base = page.url();
  return cards.map(({ rawImage, ...card }) => ({ ...card, image: pickCardImage(rawImage, base) }));
}
async function readPagePrice(page, selector, decimalSeparator) {
  const texts = await page.evaluate(
    (sel) => Array.from(document.querySelectorAll(sel)).map((el) => el instanceof HTMLInputElement ? el.value : el.textContent || ""),
    selector
  ).catch(() => []);
  for (const text of texts) {
    const price = parseDisplayPrice(text, decimalSeparator);
    if (price != null) return price;
  }
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CAPTURE_MAX_CHARS,
  GENERIC_CONSENT,
  PRICE_TEXT,
  acceptConsent,
  capturePage,
  excerptAround,
  isBlockedPage,
  readPagePrice,
  readProductRecipe,
  readSearchCards,
  simplifiedHtml
});
