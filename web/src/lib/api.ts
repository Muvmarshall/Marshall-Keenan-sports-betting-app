import type { Side } from '@parlay/shared';

export interface GameSummary {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  spread: number | null;
  total: number | null;
  status: string;
  linesPosted: boolean;
  edgesFound: number;
  linesMoved: number;
}

export interface PropEdgeSide {
  side: Side;
  multiplier: number;
  breakeven: number;
  fairProbability: number;
  edge: number;
  label: 'positive' | 'negative' | 'too_close_to_call';
}

export interface PropEdgeData {
  over: PropEdgeSide | null;
  under: PropEdgeSide | null;
  primary: PropEdgeSide | null;
}

export interface PlayerPropCard {
  propId: number;
  statType: string;
  statLabel: string;
  line: number;
  last5: number[];
  hitRateL5: number;
  hitRateL10: number;
  hitRateSeason: number;
  seasonAverage: number;
  edge: PropEdgeData;
}

export interface PlayerBlock {
  playerId: number;
  name: string;
  position: string;
  team: string;
  opponentRank: { split: string; srRank: number; epaRank: number } | null;
  props: PlayerPropCard[];
}

export interface TeamStatSide {
  teamAbbrev: string;
  split: 'overall' | 'rush' | 'pass';
  side: 'offense' | 'defense';
  yardsPerPlay: number;
  successRate: number;
  epa: number;
  srRank: number;
  epaRank: number;
  explosivePct: number;
  havocPct: number;
  opponentsFacedRank: number;
}

export interface MatchupResponse {
  game: { id: number; homeTeam: string; awayTeam: string; kickoffUtc: string; spread: number; total: number };
  home: { offense: TeamStatSide[]; defense: TeamStatSide[] };
  away: { offense: TeamStatSide[]; defense: TeamStatSide[] };
  insights: { text: string; citedNumbers: string[] }[];
}

export interface MovementMarket {
  playerId: number;
  playerName: string;
  team: string;
  statType: string;
  statLabel: string;
  openLine: number;
  currentLine: number;
  lineHistory: { at: string; line: number }[];
  priceHistory: {
    books: { book: string; price: number; at: string }[];
    platform: { multiplier: number; at: string }[];
  };
  steamFlags: { from: string; to: string; booksMoved: number; direction: 'up' | 'down' }[];
  summary: string;
}

const BASE = '/api';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json() as Promise<T>;
}

export function fetchGames(sport: string, date: string): Promise<{ games: GameSummary[]; note?: string }> {
  return getJson(`/games?sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(date)}`);
}

export function fetchMatchup(gameId: number): Promise<MatchupResponse> {
  return getJson(`/games/${gameId}/matchup`);
}

export function fetchPlayers(gameId: number): Promise<{ positions: Record<string, PlayerBlock[]> }> {
  return getJson(`/games/${gameId}/players`);
}

export function fetchMovement(gameId: number): Promise<{ markets: MovementMarket[] }> {
  return getJson(`/games/${gameId}/movement`);
}

export async function postSlip(payload: {
  clientId: string;
  mode: 'edge' | 'lottery';
  legs: { propId: number; side: Side; multiplierAtAdd: number; edgeAtAdd: number }[];
  combinedMultiplier: number;
  estProbability: number;
  estEv: number;
}): Promise<{ slipId: number }> {
  const res = await fetch(`${BASE}/slips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save slip');
  return res.json();
}
