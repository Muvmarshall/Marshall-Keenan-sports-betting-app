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

export interface Insight {
  text: string;
  citedNumbers: string[];
}

/**
 * Rule-based insights only — never free-form generation. Each function checks a
 * fixed condition against the stat rows and, when it fires, returns text that
 * names the exact numbers that triggered it.
 */
export function generateMatchupInsights(defenseRows: TeamStatSide[], offenseRows: TeamStatSide[]): Insight[] {
  const insights: Insight[] = [];

  for (const def of defenseRows) {
    // Strength-of-schedule adjustment: a defense's rank looks better/worse than its
    // slate of opponents justifies.
    if (def.srRank > 20 && def.opponentsFacedRank > 20) {
      insights.push({
        text: `${def.teamAbbrev}'s ${splitLabel(def.split)} defense ranks ${ordinal(def.srRank)} in success rate, but faced the ${ordinal(def.opponentsFacedRank)}-toughest slate of offenses. This number is softer than it looks.`,
        citedNumbers: [`sr_rank=${def.srRank}`, `opponents_faced_rank=${def.opponentsFacedRank}`],
      });
    }
    if (def.srRank <= 10 && def.opponentsFacedRank <= 10) {
      insights.push({
        text: `${def.teamAbbrev}'s ${splitLabel(def.split)} defense ranks ${ordinal(def.srRank)} in success rate against the ${ordinal(def.opponentsFacedRank)}-toughest slate of offenses. This number is earned, not padded.`,
        citedNumbers: [`sr_rank=${def.srRank}`, `opponents_faced_rank=${def.opponentsFacedRank}`],
      });
    }
  }

  for (const def of defenseRows) {
    if (def.split !== 'overall') continue;
    const off = offenseRows.find((o) => o.split === 'overall' && o.teamAbbrev !== def.teamAbbrev);
    if (!off) continue;

    if (off.explosivePct - def.explosivePct > 0.03) {
      insights.push({
        text: `${off.teamAbbrev}'s offense generates explosive plays on ${pct(off.explosivePct)} of snaps, well above the ${pct(def.explosivePct)} ${def.teamAbbrev} allows. Explosive-play rate is the widest gap on this slate.`,
        citedNumbers: [`explosive_pct=${pct(off.explosivePct)}`, `explosive_pct_allowed=${pct(def.explosivePct)}`],
      });
    }

    if (off.havocPct < def.havocPct - 0.02) {
      insights.push({
        text: `${def.teamAbbrev} creates havoc (TFLs, forced fumbles, pass breakups) on ${pct(def.havocPct)} of snaps against an offense that surrenders havoc at ${pct(off.havocPct)}. Expect disrupted downs.`,
        citedNumbers: [`havoc_pct=${pct(def.havocPct)}`, `havoc_allowed=${pct(off.havocPct)}`],
      });
    }
  }

  return insights;
}

function splitLabel(split: string): string {
  if (split === 'rush') return 'run';
  if (split === 'pass') return 'pass';
  return 'overall';
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
