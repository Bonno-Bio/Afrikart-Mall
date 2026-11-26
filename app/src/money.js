/**
 * Money arithmetic.
 *
 * Rule 1 of this codebase: money is an integer number of thebe (1/100 Pula)
 * and never a float. `P19.99` is 1999. Rounding happens once, at a named
 * boundary, and the same function is used everywhere.
 *
 * Rule 2: prices in this market are quoted VAT-inclusive. Botswana VAT is 14%.
 * A P114.00 item contains P14.00 of VAT and P100.00 of net revenue, and the
 * VAT is extracted — never added on top at checkout. Getting this backwards
 * would overcharge every customer by 14% and make every invoice wrong.
 */

export const VAT_RATE_BPS = 1400; // 14.00%
export const BPS = 10000;

export function assertMinor(value, label = 'amount') {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of thebe, got ${value}`);
  }
  if (value < 0) throw new TypeError(`${label} must not be negative, got ${value}`);
  return value;
}

/** VAT contained in a VAT-inclusive amount. */
export function vatFromInclusive(grossMinor, rateBps = VAT_RATE_BPS) {
  assertMinor(grossMinor, 'grossMinor');
  const vat = Math.round((grossMinor * rateBps) / (BPS + rateBps));
  return { netMinor: grossMinor - vat, vatMinor: vat };
}

/** VAT to add to a VAT-exclusive amount. */
export function vatFromExclusive(netMinor, rateBps = VAT_RATE_BPS) {
  assertMinor(netMinor, 'netMinor');
  const vat = Math.round((netMinor * rateBps) / BPS);
  return { netMinor, vatMinor: vat, grossMinor: netMinor + vat };
}

/** A percentage of an amount, rounded to the nearest thebe. */
export function applyBps(minor, rateBps) {
  assertMinor(minor, 'minor');
  if (!Number.isInteger(rateBps) || rateBps < 0) throw new TypeError('rateBps must be a non-negative integer');
  return Math.round((minor * rateBps) / BPS);
}

export const formatPula = (minor) => `P${(minor / 100).toFixed(2)}`;

/**
 * Sum a list of thebe amounts without ever losing a thebe to floating point.
 * Trivial, but it is the function every report goes through.
 */
export const sumMinor = (...amounts) => amounts.flat().reduce((a, b) => a + b, 0);
