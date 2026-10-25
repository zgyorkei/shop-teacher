import { PageCapture, DecimalSeparator, ProductRecipe, RecipeReading, SearchRecipe, ScrapedCard } from '../index.cjs';

/** The parts of a Playwright Page these helpers use. */
interface PageLike {
    evaluate<R, Arg>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
    title(): Promise<string>;
    url(): string;
    locator(selector: string): {
        first(): {
            isVisible(): Promise<boolean>;
            click(): Promise<unknown>;
        };
        count(): Promise<number>;
    };
    waitForSelector(selector: string, options?: {
        timeout?: number;
    }): Promise<unknown>;
}
/**
 * Accept buttons of the common consent platforms. Pages being taught have no
 * recipe yet, so this lets the capture show the real page.
 */
declare const GENERIC_CONSENT: string;
/** Size of the HTML excerpt handed to Gemini when teaching (~30k tokens). */
declare const CAPTURE_MAX_CHARS = 110000;
/** Where a product page's own price usually is: the first price-looking text. */
declare const PRICE_TEXT: RegExp;
/** True for bot checks and error interstitials. */
declare function isBlockedPage(page: PageLike): Promise<boolean>;
/** Clicks a cookie banner's accept button when one is showing. */
declare function acceptConsent(page: PageLike, selector: string | undefined): Promise<void>;
/** The page's body with scripts, styles and most attributes stripped and long texts cut. */
declare function simplifiedHtml(page: PageLike): Promise<string>;
/**
 * A window of at most `maxChars` around the first match of `focus` (a set
 * number, or a pattern such as PRICE_TEXT), starting `before` characters ahead
 * of it; the whole text when it is short enough.
 */
declare function excerptAround(html: string, focus: string | RegExp, maxChars?: number, before?: number): string;
/** The open page as teaching input: a compact HTML excerpt centred on `focus`, with its title and URL. */
declare function capturePage(page: PageLike, focus?: string | RegExp, options?: {
    maxChars?: number;
    before?: number;
}): Promise<PageCapture>;
/** Reads a product recipe on the open page; never throws (a rejected selector is reported in `error`). */
declare function readProductRecipe(page: PageLike, recipe: ProductRecipe): Promise<RecipeReading>;
/**
 * The product cards of a search page as the recipe reads them (at most 60).
 * Throws when the browser rejects one of the recipe's selectors.
 */
declare function readSearchCards(page: PageLike, recipe: SearchRecipe): Promise<ScrapedCard[]>;
/**
 * A product page's price from `selector`: the first match that reads as a
 * price (the first is often an empty placeholder; form fields such as
 * Amazon's hidden price input carry it in their value). Null when none does.
 */
declare function readPagePrice(page: PageLike, selector: string, decimalSeparator: DecimalSeparator): Promise<number | null>;

export { CAPTURE_MAX_CHARS, GENERIC_CONSENT, PRICE_TEXT, acceptConsent, capturePage, excerptAround, isBlockedPage, readPagePrice, readProductRecipe, readSearchCards, simplifiedHtml };
export type { PageLike };
