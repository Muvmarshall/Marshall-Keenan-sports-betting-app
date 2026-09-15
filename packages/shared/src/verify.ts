import { noVigProbability, breakeven, edgeCallLabel, type EdgeCallLabel } from './math.js';

export interface VerifyFairInput {
  /** American (e.g. -110, +120) or decimal (e.g. 1.9091) odds — auto-detected. */
  over: number;
  under: number;
  multiplier: number;
}

export interface VerifyFairResult {
  input: VerifyFairInput;
  decimal: { over: number; under: number };
  rawImplied: { over: number; under: number };
  overround: number;
  fair: { over: number; under: number };
  breakeven: number;
  edge: number;
  label: EdgeCallLabel;
}

/**
 * American odds are always an integer with |value| >= 100 by convention (-110,
 * +120, never -50 or +80); decimal odds for a two-way market are always > 1 and,
 * in practice, well under 100. That gap is what makes auto-detection safe here.
 */
export function isAmericanOdds(price: number): boolean {
  return Math.abs(price) >= 100;
}

export function americanToDecimal(american: number): number {
  if (american === 0) throw new Error('American odds cannot be 0.');
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function toDecimalOdds(price: number): number {
  return isAmericanOdds(price) ? americanToDecimal(price) : price;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/**
 * The public, externally-verifiable calculation: every intermediate step exposed
 * so a stranger can check it by hand. Edge/breakeven are always computed for the
 * OVER side specifically (not "whichever side has the bigger edge" — that's a
 * product-UI convenience used elsewhere in this codebase, not what this endpoint
 * is for). See README "Verification endpoint" for the four reference cases this
 * must reproduce exactly.
 */
export function verifyFair(input: VerifyFairInput): VerifyFairResult {
  const decOver = toDecimalOdds(input.over);
  const decUnder = toDecimalOdds(input.under);

  const { pOver: rawOver, pUnder: rawUnder, overround } = rawImpliedProbabilities(decOver, decUnder);
  const fair = noVigProbability(decOver, decUnder);
  const be = breakeven(input.multiplier);
  const edge = fair.pOver - be;

  return {
    input,
    decimal: { over: round4(decOver), under: round4(decUnder) },
    rawImplied: { over: round4(rawOver), under: round4(rawUnder) },
    overround: round4(overround),
    fair: { over: round4(fair.pOver), under: round4(fair.pUnder) },
    breakeven: round4(be),
    edge: round4(edge),
    label: edgeCallLabel(edge),
  };
}

function rawImpliedProbabilities(decOver: number, decUnder: number) {
  const pOver = 1 / decOver;
  const pUnder = 1 / decUnder;
  return { pOver, pUnder, overround: pOver + pUnder };
}
