import type { BookQuote, Side, StatType } from '@parlay/shared';

export interface PropContext {
  propId: number;
  statBaselineProbability: number; // rough fair probability the line represents, drives the mock's random walk
  // Everything below is unused by the mock but is what a real feed needs to find
  // this exact market: which event, which player, which stat, which line.
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  playerName: string;
  statType: StatType;
  line: number;
}

export interface OddsTick {
  /** Sportsbook quotes used for the no-vig consensus. Excludes the platform's own line. */
  bookQuotes: BookQuote[];
  /** This platform's own posted multiplier for each side, tracked separately over time. */
  platformMultiplier: Record<Side, number>;
}

export interface OddsProvider {
  /**
   * Advance (or initialize) the market for one prop by a single tick and return the
   * new quotes. Async because a real provider fetches over the network — the mock
   * is synchronous internally but still returns a resolved promise, so every call
   * site awaits uniformly regardless of which implementation is active.
   */
  tick(ctx: PropContext): Promise<OddsTick>;
}

export const SPORTSBOOKS: { name: string; weight: number }[] = [
  { name: 'Pinnacle', weight: 3 },
  { name: 'Circa', weight: 2 },
  { name: 'DraftKings', weight: 1 },
  { name: 'FanDuel', weight: 1 },
  { name: 'Caesars', weight: 1 },
];

export const PLATFORM_BOOK = 'Parlay Platform';
