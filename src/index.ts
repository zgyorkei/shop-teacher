// The browser-safe part: recipes, price parsing and the teaching loops. No
// Node APIs here, so a renderer or a web page can import it. The Gemini client
// and key store are in "shop-teacher/gemini", the in-page helpers in
// "shop-teacher/browser".

export { parseDisplayPrice, isDecimalSeparator, type DecimalSeparator } from './price.js';
export { extractJsonObject, hasJsonObject, dropNulls, isSelector } from './json.js';
export { parseProductRecipe, shopHost, type ProductRecipe, type RecipeReading } from './productRecipe.js';
export {
  parseSearchRecipe,
  titleMatchScore,
  rankCards,
  type SearchRecipe,
  type ScrapeCookie,
  type RecipeTestResult,
  type ScrapedCard,
  type PickedCard,
} from './searchRecipe.js';
export {
  teachProductPage,
  buildProductTeachPrompt,
  buildProductRetryPrompt,
  type PageCapture,
  type TeachProductDeps,
  type TeachProductResult,
} from './teachProduct.js';
export {
  teachSearchPage,
  buildSearchTeachPrompt,
  buildSearchRetryPrompt,
  sampleUrl,
  MAX_TEACH_SAMPLES,
  type TeachSourceInput,
  type TeachCapture,
  type TeachSearchDeps,
  type TeachSample,
  type TeachSearchResult,
} from './teachSearch.js';
