/** How a shop writes decimals: "1.234,56" uses ",", "1,234.56" uses "."; "auto" reads it off each price. */
type DecimalSeparator = ',' | '.' | 'auto';
declare const isDecimalSeparator: (v: unknown) => v is DecimalSeparator;
/**
 * Reads a price out of display text such as "1.234,56 €", "13 990 Ft" or
 * "US $1,234.56". Returns null if no positive number is present.
 */
declare function parseDisplayPrice(text: string | null | undefined, decimalSeparator?: DecimalSeparator): number | null;

interface ProductRecipe {
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
interface RecipeReading {
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
declare function parseProductRecipe(raw: unknown): ProductRecipe | null;
/** A page's shop: its host without "www.", e.g. "alza.hu"; recipes are kept per shop. */
declare function shopHost(url: string): string | null;

interface ScrapeCookie {
    name: string;
    value: string;
    domain: string;
}
interface SearchRecipe {
    version: 1;
    /** CSS selector matching each product card on the search page. */
    resultSelector: string;
    /**
     * Within a card: the product title. Every match is joined with spaces, so a
     * layout that splits brand and title ("LEGO" + "Creator ... 31393") reads
     * as one title.
     */
    titleSelector: string;
    /** Within a card: the current price (not a struck-through list price). */
    priceSelector: string;
    /** Within a card: the product link, used for the product-page fallback. */
    linkSelector?: string;
    /**
     * How the shop writes decimals. "auto" reads it off each price, for shops
     * whose format follows the UI language (Amazon switches between "45,89 €"
     * and "€45.89").
     */
    decimalSeparator: DecimalSeparator;
    /** Case-insensitive word every genuine title contains, e.g. "lego". */
    requireWord?: string;
    /** Case-insensitive regex source; matching titles are skipped (accessories). */
    excludeTitlePattern?: string;
    /** On the product page: the price, for cards that show none in the results. */
    productPagePriceSelector?: string;
    /** Cookie-banner accept button, clicked if present. */
    consentSelector?: string;
    /** Cookies set before the first visit, e.g. a display-currency preference. */
    cookies?: ScrapeCookie[];
}
/**
 * What a search recipe produced on one live page. The counts and titles are
 * what teaching feeds back to Gemini when a recipe finds nothing.
 */
interface RecipeTestResult {
    price: number | null;
    url: string | null;
    /** Elements matched by resultSelector. */
    cardsFound: number;
    /** Cards that passed the title rules (set number, requireWord, exclusions). */
    matched: number;
    /** The first few card titles as read, for diagnosing selector problems. */
    titles: string[];
    /** The page was a bot check or an error page. */
    blocked: boolean;
}
/** One product card as read off the page, before any matching. */
interface ScrapedCard {
    title: string;
    priceText: string | null;
    href: string | null;
}
/**
 * Validates an untrusted recipe (from Gemini or a database) and returns a clean
 * copy with only known fields, or null. Regex patterns are compiled here so a
 * bad one is rejected up front rather than throwing mid-scrape.
 */
declare function parseSearchRecipe(raw: unknown): SearchRecipe | null;
/**
 * 2 = the set number sits where shops put the product code of the set itself:
 * closing the title ("LEGO Icons Bürgermeistervilla 11383") or among its
 * first four words ("LEGO City 60488 Chip Truck"). 1 = elsewhere, typical of
 * bundles and add-ons that merely reference the set. 0 = absent.
 */
declare function titleMatchScore(title: string, setNumber: string): number;
interface PickedCard extends ScrapedCard {
    price: number | null;
    score: number;
}
/**
 * Filters cards to genuine listings of the set, keeps only the strongest title
 * match present, and orders those cheapest first. Cards with no visible price
 * come last so the caller can try their product page.
 *
 * Weaker matches are dropped rather than ranked lower: when the set's own
 * listing has no price (Amazon's "See options"), falling through to the next
 * card used to report a minifigure pack that merely mentions the set number.
 * No price is better than the wrong product's price.
 */
declare function rankCards(cards: ScrapedCard[], setNumber: string, recipe: SearchRecipe): PickedCard[];

interface PageCapture {
    html: string;
    title: string;
    finalUrl: string;
}
interface TeachProductDeps {
    capture(url: string): Promise<PageCapture | null>;
    test(url: string, recipe: ProductRecipe): Promise<RecipeReading>;
    /** Asks Gemini; resolves with the raw response text. */
    ask(prompt: string): Promise<string>;
}
interface TeachProductResult {
    /** Null when no attempt produced a recipe that found a price. */
    recipe: ProductRecipe | null;
    reading: RecipeReading | null;
    attempts: number;
    /** Plain-language reason when nothing usable came out. */
    error?: string;
}
declare function buildProductTeachPrompt(shop: string, itemName: string, capture: PageCapture): string;
declare function buildProductRetryPrompt(basePrompt: string, recipe: unknown, reading: RecipeReading | null): string;
/**
 * Teaches one shop from one of its product pages. `shop` names the shop in the
 * prompt (usually its host); `itemName` tells Gemini which product to look for.
 */
declare function teachProductPage(shop: string, url: string, itemName: string, deps: TeachProductDeps): Promise<TeachProductResult>;

export { buildProductRetryPrompt as g, buildProductTeachPrompt as h, isDecimalSeparator as i, parseProductRecipe as j, parseSearchRecipe as k, titleMatchScore as l, parseDisplayPrice as p, rankCards as r, shopHost as s, teachProductPage as t };
export type { DecimalSeparator as D, PageCapture as P, RecipeTestResult as R, SearchRecipe as S, TeachProductDeps as T, PickedCard as a, ProductRecipe as b, RecipeReading as c, ScrapeCookie as d, ScrapedCard as e, TeachProductResult as f };
