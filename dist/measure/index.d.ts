import { PageLike } from '../browser/index.js';
import { PageCapture } from '../index.js';

type LengthUnit = 'mm' | 'cm' | 'm';
type Axis = 'width' | 'depth' | 'height';
declare const AXES: Axis[];
interface MeasureRecipe {
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
interface MeasureReading {
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
/** Validates an untrusted recipe (from Gemini or storage): a clean copy with only known fields, or null. */
declare function parseMeasureRecipe(raw: unknown): MeasureRecipe | null;
/**
 * The sizes a text gives: three numbers multiplied out read as width × depth ×
 * height ("140 x 46 x 84 cm"), else each measure by its label ("Width: 140
 * cm", "Magasság 84 cm"), else two numbers as width × height. Numbers without
 * a unit are in `unit`. Metres; a measure not found is left out.
 */
declare function parseSizes(text: string, unit?: LengthUnit): Partial<Record<Axis, number>>;
/** Where a product page's size usually is: a dimensions label, or numbers multiplied out. */
declare const SIZE_TEXT: RegExp;
/** The open page as teaching input, centred on where its size is written. */
declare function captureForSizes(page: PageLike, options?: {
    maxChars?: number;
    before?: number;
}): Promise<PageCapture>;
/** Reads a measure recipe on the open page; never throws (a rejected selector is reported in `error`). */
declare function readMeasureRecipe(page: PageLike, recipe: MeasureRecipe): Promise<MeasureReading>;
/** How many of the three measures a reading has. */
declare const measuresFound: (reading: Pick<MeasureReading, Axis> | null) => number;
interface TeachMeasureDeps {
    capture(url: string): Promise<PageCapture | null>;
    /** Runs the recipe on the live page. An app may judge the texts with its own size rules and fill the measures itself. */
    test(url: string, recipe: MeasureRecipe): Promise<MeasureReading>;
    /** Asks Gemini; resolves with the raw response text. */
    ask(prompt: string): Promise<string>;
}
interface TeachMeasureResult {
    /** Null when no attempt produced a recipe that found at least two of the three measures. */
    recipe: MeasureRecipe | null;
    reading: MeasureReading | null;
    attempts: number;
    /** Plain-language reason when nothing usable came out. */
    error?: string;
}
declare function buildMeasureTeachPrompt(shop: string, itemName: string, capture: PageCapture): string;
declare function buildMeasureRetryPrompt(basePrompt: string, recipe: unknown, reading: MeasureReading | null): string;
/**
 * Teaches one shop's sizes from one of its product pages: a recipe is kept
 * only when, run on the live page, it finds at least two of the three measures.
 */
declare function teachMeasurePage(shop: string, url: string, itemName: string, deps: TeachMeasureDeps): Promise<TeachMeasureResult>;

export { AXES, SIZE_TEXT, buildMeasureRetryPrompt, buildMeasureTeachPrompt, captureForSizes, measuresFound, parseMeasureRecipe, parseSizes, readMeasureRecipe, teachMeasurePage };
export type { Axis, LengthUnit, MeasureReading, MeasureRecipe, TeachMeasureDeps, TeachMeasureResult };
