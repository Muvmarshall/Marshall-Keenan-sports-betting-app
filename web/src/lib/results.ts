const BASE = '/api';

export interface SampleSized {
  n: number;
  sampleSizeWarning: boolean;
}

export interface ResultsResponse {
  overview: { totalFlagged: number; dateRange: { earliest: string | null; latest: string | null } };
  closingLineValue: SampleSized & { avgClvPoints: number | null; pctMovedTowardFlag: number | null };
  hitRate: SampleSized & { actual: number | null; expectedBreakeven: number | null; expectedFairProbability: number | null };
  byStatType: (SampleSized & { statType: string; avgEdge: number; closedN: number; avgClvPoints: number | null; settledN: number; hitRate: number | null })[];
  byEdgeBand: (SampleSized & { band: string; closedN: number; avgClvPoints: number | null; settledN: number; hitRate: number | null })[];
  byWeek: (SampleSized & { weekStart: string; closedN: number; avgClvPoints: number | null; settledN: number; hitRate: number | null })[];
  sampleSizeWarningThreshold: number;
}

export async function fetchResults(): Promise<ResultsResponse> {
  const res = await fetch(`${BASE}/results`);
  if (!res.ok) throw new Error('Failed to load results');
  return res.json();
}
