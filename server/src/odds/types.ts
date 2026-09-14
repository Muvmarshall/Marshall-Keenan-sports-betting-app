import type { BookQuote, Side } from '@parlay/shared';

export interface PropContext {
  propId: number;
  statBaselineProbability: number; // rough fair probability the line represents, drives the random walk
}

export interface OddsTick {
  /** Sportsbook quotes used for the no-vig consensus. Excludes the platform's own line. */
  bookQuotes: BookQuote[];
  /** This platform's own posted multiplier for each side, tracked separately over time. */
  platformMultiplier: Record<Side, number>;
}

export interface OddsProvider {
  /** Advance (or initialize) the market for one prop by a single tick and return the new quotes. */
  tick(ctx: PropContext): OddsTick;
}

export const SPORTSBOOKS: { name: string; weight: number }[] = [
  { name: 'Pinnacle', weight: 3 },
  { name: 'Circa', weight: 2 },
  { name: 'DraftKings', weight: 1 },
  { name: 'FanDuel', weight: 1 },
  { name: 'Caesars', weight: 1 },
];

export const PLATFORM_BOOK = 'Parlay Platform';
