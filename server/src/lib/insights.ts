export interface TeamStatSide {
  teamAbbrev: string;
  split: 'overall' | 'rush' | 'pass';
  side: 'offense' | 'defense';
  yardsPerPlay: number;
  // These four have no source without full play-by-play data in nflverse mode —
  // null means genuinely unavailable, not zero. See README "Data provenance."
  successRate: number | null;
  epa: number;
  srRank: number | null;
  epaRank: number;
  explosivePct: number | null;
  havocPct: number | null;
  opponentsFacedRank: number | null;
}

export interface Insight {
  text: string;
  citedNumbers: string[];
}

/**
 * Rule-based insights only — never free-form generation. Each function checks a
 * fixed condition against the stat rows and, when it fires, returns text that
 * names the exact numbers that triggered it. Rules whose inputs are null (no
 * licensed source for that field this build) are skipped entirely rather than
 * risk a null-coerces-to-0 comparison firing on missing data.
 */
export function generateMatchupInsights(defenseRows: TeamStatSide[], offenseRows: TeamStatSide[]): Insight[] {
  const insights: Insight[] = [];

  for (const def of defenseRows) {
    // Strength-of-schedule adjustment: a defense's rank looks better/worse than its
    // slate of opponents justifies. Requires both srRank and opponentsFacedRank —
    // neither exists without play-by-play data (nflverse mode leaves them null).
    if (def.srRank === null || def.opponentsFacedRank === null) continue;

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

    if (off.explosivePct !== null && def.explosivePct !== null && off.explosivePct - def.explosivePct > 0.03) {
      insights.push({
        text: `${off.teamAbbrev}'s offense generates explosive plays on ${pct(off.explosivePct)} of snaps, well above the ${pct(def.explosivePct)} ${def.teamAbbrev} allows. Explosive-play rate is the widest gap on this slate.`,
        citedNumbers: [`explosive_pct=${pct(off.explosivePct)}`, `explosive_pct_allowed=${pct(def.explosivePct)}`],
      });
    }

    if (off.havocPct !== null && def.havocPct !== null && off.havocPct < def.havocPct - 0.02) {
      insights.push({
        text: `${def.teamAbbrev} creates havoc (TFLs, forced fumbles, pass breakups) on ${pct(def.havocPct)} of snaps against an offense that surrenders havoc at ${pct(off.havocPct)}. Expect disrupted downs.`,
        citedNumbers: [`havoc_pct=${pct(def.havocPct)}`, `havoc_allowed=${pct(off.havocPct)}`],
      });
    }

    // EPA/play is the one per-play efficiency figure available in every mode (real
    // data included, since nflverse's season/weekly files carry it directly) — so
    // this rule covers real-data games where the SOS/explosive/havoc rules above
    // have nothing to fire on.
    const epaGap = off.epa - def.epa;
    if (epaGap > 0.15) {
      insights.push({
        text: `${off.teamAbbrev}'s ${splitLabel(off.split)} offense averages ${off.epa.toFixed(2)} EPA/play against a ${def.teamAbbrev} defense allowing ${def.epa.toFixed(2)} — one of the larger efficiency gaps on this slate.`,
        citedNumbers: [`epa=${off.epa.toFixed(3)}`, `epa_allowed=${def.epa.toFixed(3)}`],
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
