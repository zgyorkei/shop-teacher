/** How a shop writes decimals: "1.234,56" uses ",", "1,234.56" uses "."; "auto" reads it off each price. */
export type DecimalSeparator = ',' | '.' | 'auto';

export const isDecimalSeparator = (v: unknown): v is DecimalSeparator => v === ',' || v === '.' || v === 'auto';

/**
 * Reads a price out of display text such as "1.234,56 €", "13 990 Ft" or
 * "US $1,234.56". Returns null if no positive number is present.
 */
export function parseDisplayPrice(text: string | null | undefined, decimalSeparator: DecimalSeparator = 'auto'): number | null {
  // Thin and non-breaking spaces are common thousands separators.
  const compact = String(text ?? '').replace(/[\s  ]/g, '');
  const m = compact.match(/\d[\d.,]*/);
  if (!m) return null;
  let num = m[0].replace(/[.,]$/, '');
  let sep = decimalSeparator;
  if (sep === 'auto') {
    // The last separator is the decimal one only if exactly two digits
    // follow it; "1.234" and "1,234" are thousands, "45,89" is cents.
    const last = Math.max(num.lastIndexOf(','), num.lastIndexOf('.'));
    const isDecimal = last >= 0 && num.length - last - 1 === 2;
    sep = isDecimal ? (num[last] as ',' | '.') : num.includes(',') ? '.' : ',';
  }
  num = sep === ',' ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  const value = parseFloat(num);
  return Number.isFinite(value) && value > 0 ? value : null;
}
