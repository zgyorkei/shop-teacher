import { R as RecipeTestResult, P as PageCapture, S as SearchRecipe } from './teachProduct--J36ag3Z.cjs';
export { D as DecimalSeparator, a as PickedCard, b as ProductRecipe, c as RecipeReading, d as ScrapeCookie, e as ScrapedCard, T as TeachProductDeps, f as TeachProductResult, g as buildProductRetryPrompt, h as buildProductTeachPrompt, i as isDecimalSeparator, p as parseDisplayPrice, j as parseProductRecipe, k as parseSearchRecipe, r as rankCards, s as shopHost, t as teachProductPage, l as titleMatchScore } from './teachProduct--J36ag3Z.cjs';

/** The first JSON object in a model response (tolerates code fences and chatter), or null. */
declare function extractJsonObject(text: string): unknown;
/** True when a model response holds a parseable JSON object: an accept test for askGemini. */
declare const hasJsonObject: (text: string) => boolean;
/** Gemini answers "null" as a string or JSON null; recipes treat both, and "", as absent. */
declare function dropNulls(raw: unknown): unknown;
/** A plausible CSS selector from untrusted input: a non-empty string of sane length. */
declare const isSelector: (v: unknown) => v is string;

interface TeachSourceInput {
    name: string;
    /** The shop's search URL with a {setNumber} placeholder. */
    urlTemplate: string;
    currency: string;
}
interface TeachCapture {
    setNumber: string;
    url: string;
    html: string;
    title: string;
}
interface TeachSearchDeps {
    capture(url: string, setNumber: string): Promise<PageCapture | null>;
    test(url: string, setNumber: string, recipe: SearchRecipe): Promise<RecipeTestResult>;
    /** Asks Gemini; resolves with the raw response text. */
    ask(prompt: string): Promise<string>;
}
interface TeachSample {
    setNumber: string;
    result: RecipeTestResult | null;
}
interface TeachSearchResult {
    /** Null when no attempt produced a usable recipe. */
    recipe: SearchRecipe | null;
    samples: TeachSample[];
    attempts: number;
    /** Plain-language reason when nothing usable came out. */
    error?: string;
}
declare const MAX_TEACH_SAMPLES = 3;
declare const sampleUrl: (urlTemplate: string, setNumber: string) => string;
declare function buildSearchTeachPrompt(source: TeachSourceInput, captures: TeachCapture[]): string;
declare function buildSearchRetryPrompt(basePrompt: string, recipe: unknown, samples: TeachSample[]): string;
declare function teachSearchPage(source: TeachSourceInput, setNumbers: string[], deps: TeachSearchDeps): Promise<TeachSearchResult>;

export { MAX_TEACH_SAMPLES, PageCapture, RecipeTestResult, SearchRecipe, buildSearchRetryPrompt, buildSearchTeachPrompt, dropNulls, extractJsonObject, hasJsonObject, isSelector, sampleUrl, teachSearchPage };
export type { TeachCapture, TeachSample, TeachSearchDeps, TeachSearchResult, TeachSourceInput };
