import type { BookQuote, EdgeResult, FairProbabilityResult, SlipLegInput, SlipRollup } from './types.js';

/** Remove the vig from one book's two-sided price and return the fair probability of each side. */
export function noVigProbability(priceOverDecimal: number, priceUnderDecimal: number): FairProbabilityResult {
  const pOverRaw = 1 / priceOverDecimal;
  const pUnderRaw = 1 / priceUnderDecimal;
  const overround = pOverRaw + pUnderRaw;
  return {
    pOver: pOverRaw / overround,
    pUnder: pUnderRaw / overround,
    overround,
  };
}

/**
 * Consensus fair probability across multiple books, weighting sharp books more heavily.
 * Each quote is de-vigged individually, then averaged by weight.
 */
export function consensusFairProbability(quotes: BookQuote[]): FairProbabilityResult {
  if (quotes.length === 0) {
    throw new Error('consensusFairProbability requires at least one book quote');
  }
  let weightedOver = 0;
  let totalWeight = 0;
  let overroundSum = 0;
  for (const q of quotes) {
    const fair = noVigProbability(q.priceOver, q.priceUnder);
    weightedOver += fair.pOver * q.weight;
    overroundSum += fair.overround * q.weight;
    totalWeight += q.weight;
  }
  const pOver = weightedOver / totalWeight;
  return {
    pOver,
    pUnder: 1 - pOver,
    overround: overroundSum / totalWeight,
  };
}

/** Win rate required to break even at a given payout multiplier. Does not vary with leg count. */
export function breakeven(multiplier: number): number {
  return 1 / multiplier;
}

/** Edge of a single selection: fair probability minus the win rate the multiplier requires. */
export function edgeForSelection(multiplier: number, fairProbability: number): EdgeResult {
  const be = breakeven(multiplier);
  return {
    multiplier,
    breakeven: be,
    fairProbability,
    edge: fairProbability - be,
  };
}

export type EdgeCallLabel = 'positive' | 'negative' | 'too_close_to_call';

/** Below 1 point of edge in either direction, label honestly rather than faking precision. */
export function edgeCallLabel(edge: number): EdgeCallLabel {
  if (Math.abs(edge) < 0.01) return 'too_close_to_call';
  return edge > 0 ? 'positive' : 'negative';
}

/**
 * Combined slip math assuming independence between legs (correlation is flagged
 * elsewhere, never folded into this number — see correlation.ts).
 *
 *   combinedMultiplier = product of leg multipliers
 *   estHitRate         = product of leg fair probabilities
 *   breakevenNeeded     = 1 / combinedMultiplier
 *   expectedValue       = estHitRate * combinedMultiplier - 1
 */
export function computeSlipRollup(legs: SlipLegInput[]): SlipRollup | null {
  if (legs.length === 0) return null;

  const combinedMultiplier = legs.reduce((acc, leg) => acc * leg.multiplier, 1);
  const estHitRate = legs.reduce((acc, leg) => acc * leg.fairProbability, 1);
  const breakevenNeeded = breakeven(combinedMultiplier);
  const expectedValue = estHitRate * combinedMultiplier - 1;

  const legsWithEdge = legs.map((leg) => ({
    leg,
    edge: edgeForSelection(leg.multiplier, leg.fairProbability).edge,
  }));
  const legsPositive = legsWithEdge.filter((l) => l.edge > 0).length;
  const legsNegative = legsWithEdge.filter((l) => l.edge < 0).length;

  const weakestLegs = [...legsWithEdge]
    .filter((l) => l.edge < 0)
    .sort((a, b) => a.edge - b.edge)
    .slice(0, 2)
    .map((l) => l.leg);

  let evWithoutWeakestLegs: number | null = null;
  if (weakestLegs.length > 0 && weakestLegs.length < legs.length) {
    const remaining = legs.filter((l) => !weakestLegs.some((w) => w.id === l.id));
    const remainingRollup = computeSlipRollup(remaining);
    evWithoutWeakestLegs = remainingRollup ? remainingRollup.expectedValue : null;
  }

  return {
    legCount: legs.length,
    combinedMultiplier,
    estHitRate,
    breakevenNeeded,
    expectedValue,
    legsPositive,
    legsNegative,
    weakestLegs,
    evWithoutWeakestLegs,
  };
}
