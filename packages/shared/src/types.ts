export type Sport = 'NFL' | 'NCAAF' | 'NBA' | 'MLB';

export type StatSplit = 'overall' | 'rush' | 'pass';

export type StatType =
  | 'pass_yds'
  | 'rush_yds'
  | 'rec_yds'
  | 'receptions'
  | 'pass_tds'
  | 'rush_tds'
  | 'rec_tds'
  | 'team_total';

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'TEAM';

export type Side = 'over' | 'under';

export interface BookQuote {
  book: string;
  /** decimal odds, e.g. 1.91 for -110 */
  priceOver: number;
  priceUnder: number;
  /** relative weight in the consensus average; sharp books weigh higher */
  weight: number;
  observedAt: string;
}

export interface FairProbabilityResult {
  /** no-vig probability the "over" side hits, 0-1 */
  pOver: number;
  pUnder: number;
  /** raw overround before vig removal, e.g. 1.05 */
  overround: number;
}

export interface EdgeResult {
  multiplier: number;
  /** win rate required to break even on this multiplier, 0-1 */
  breakeven: number;
  /** consensus no-vig fair probability, 0-1 */
  fairProbability: number;
  /** fairProbability - breakeven, in probability points (0-1) */
  edge: number;
}

export interface SlipLegInput {
  id: string;
  playerName: string;
  statLabel: string;
  line: number;
  side: Side;
  multiplier: number;
  fairProbability: number;
  team?: string;
  statType?: StatType;
  position?: Position;
}

export interface SlipRollup {
  legCount: number;
  combinedMultiplier: number;
  estHitRate: number;
  breakevenNeeded: number;
  expectedValue: number;
  legsPositive: number;
  legsNegative: number;
  weakestLegs: SlipLegInput[];
  evWithoutWeakestLegs: number | null;
}

export interface CorrelationFlag {
  legIds: [string, string];
  reason: string;
}
