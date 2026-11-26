import test from 'node:test';
import assert from 'node:assert/strict';
import { vatFromInclusive, vatFromExclusive, applyBps, formatPula, VAT_RATE_BPS } from '../src/money.js';

test('VAT is extracted from an inclusive price, never added on top', () => {
  // P114.00 inclusive at 14% contains exactly P14.00 of VAT.
  assert.deepEqual(vatFromInclusive(11400), { netMinor: 10000, vatMinor: 1400 });
  // P400.00 inclusive -> P49.12 VAT, P350.88 net.
  assert.deepEqual(vatFromInclusive(40000), { netMinor: 35088, vatMinor: 4912 });
});

test('the two directions agree to the thebe', () => {
  for (const net of [100, 999, 12345, 987654]) {
    const { grossMinor } = vatFromExclusive(net);
    assert.equal(vatFromInclusive(grossMinor).netMinor, net, `round trip failed for ${net}`);
  }
});

test('the VAT rate is the statute, not a variable someone can quietly change', () => {
  assert.equal(VAT_RATE_BPS, 1400);
});

test('percentage maths rounds to the nearest thebe', () => {
  assert.equal(applyBps(10000, 1200), 1200); // 12% of P100.00
  assert.equal(applyBps(100, 1200), 12); // 12% of 100 thebe
  assert.equal(applyBps(0, 1200), 0);
});

test('floats, negatives and NaN are refused rather than rounded', () => {
  assert.throws(() => vatFromInclusive(19.99), /integer/);
  assert.throws(() => vatFromInclusive(-100), /negative/);
  assert.throws(() => applyBps(1000, -1), /non-negative/);
  assert.throws(() => applyBps(1000, 12.5), /integer/);
});

test('formatting is for humans and never for maths', () => {
  assert.equal(formatPula(40800), 'P408.00');
  assert.equal(formatPula(5), 'P0.05');
});
