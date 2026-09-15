import { describe, expect, it } from 'vitest';
import { verifyFair, americanToDecimal, isAmericanOdds } from './verify.js';

/**
 * The four reference cases from the Phase 2 spec. These must pass exactly — this
 * is the test that proves the vig is actually being removed, not just averaged
 * away. Row 1 is the critical one: a symmetric -110/-110 market is a coin flip,
 * so a 2.00x multiplier must show exactly zero edge.
 */
describe('verifyFair — reference cases', () => {
  it('case 1: -110/-110, 2.00x → coin flip, zero edge', () => {
    const r = verifyFair({ over: -110, under: -110, multiplier: 2.0 });
    expect(r.fair.over).toBeCloseTo(0.5, 4);
    expect(r.edge).toBeCloseTo(0.0, 4);
    expect(r.label).toBe('too_close_to_call');
  });

  it('case 2: -130/+110, 2.00x → +0.0427 edge', () => {
    const r = verifyFair({ over: -130, under: 110, multiplier: 2.0 });
    expect(r.fair.over).toBeCloseTo(0.5427, 4);
    expect(r.edge).toBeCloseTo(0.0427, 4);
  });

  it('case 3: -200/+165, 2.00x → +0.1386 edge', () => {
    const r = verifyFair({ over: -200, under: 165, multiplier: 2.0 });
    expect(r.fair.over).toBeCloseTo(0.6386, 4);
    expect(r.edge).toBeCloseTo(0.1386, 4);
  });

  it('case 4: +120/-140, 1.80x → -0.1176 edge', () => {
    const r = verifyFair({ over: 120, under: -140, multiplier: 1.8 });
    expect(r.fair.over).toBeCloseTo(0.438, 4);
    expect(r.edge).toBeCloseTo(-0.1176, 4);
  });
});

describe('verifyFair — full response shape (case 1)', () => {
  it('exposes every intermediate value', () => {
    const r = verifyFair({ over: -110, under: -110, multiplier: 2.0 });
    expect(r.decimal.over).toBeCloseTo(1.9091, 4);
    expect(r.decimal.under).toBeCloseTo(1.9091, 4);
    expect(r.rawImplied.over).toBeCloseTo(0.5238, 4);
    expect(r.rawImplied.under).toBeCloseTo(0.5238, 4);
    expect(r.overround).toBeCloseTo(1.0476, 4);
    expect(r.breakeven).toBeCloseTo(0.5, 4);
  });
});

describe('americanToDecimal', () => {
  it('converts positive American odds', () => {
    expect(americanToDecimal(120)).toBeCloseTo(2.2, 4);
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 4);
  });
  it('converts negative American odds', () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 4);
  });
  it('throws on zero', () => {
    expect(() => americanToDecimal(0)).toThrow();
  });
});

describe('isAmericanOdds', () => {
  it('treats |price| >= 100 as American', () => {
    expect(isAmericanOdds(-110)).toBe(true);
    expect(isAmericanOdds(120)).toBe(true);
  });
  it('treats everything else as decimal', () => {
    expect(isAmericanOdds(1.9091)).toBe(false);
    expect(isAmericanOdds(2.0)).toBe(false);
  });
});

describe('verifyFair — accepts decimal input directly', () => {
  it('matches the American-input case 1 result', () => {
    const r = verifyFair({ over: 1.9091, under: 1.9091, multiplier: 2.0 });
    expect(r.edge).toBeCloseTo(0.0, 3);
  });
});
