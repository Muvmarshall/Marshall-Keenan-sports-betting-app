import type { BookQuote, Side } from '@parlay/shared';
import { PLATFORM_BOOK, SPORTSBOOKS, type OddsProvider, type OddsTick, type PropContext } from './types.js';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

interface MarketState {
  probOver: number; // hidden fair probability, drifts each tick
  platformProbOver: number; // slower-moving EMA the platform's own multiplier tracks
}

/**
 * Simulates a realistic multi-book market: a shared fair probability random-walks
 * each tick, every sportsbook quotes around it with idiosyncratic noise (tighter for
 * sharp books), and the platform's own multiplier lags the true move via an EMA —
 * which is exactly the kind of gap the product is built to surface.
 */
export class MockOddsProvider implements OddsProvider {
  private state = new Map<number, MarketState>();
  private rngs = new Map<number, () => number>();

  private rngFor(propId: number): () => number {
    let rng = this.rngs.get(propId);
    if (!rng) {
      rng = mulberry32(propId * 2654435761 + 12345);
      this.rngs.set(propId, rng);
    }
    return rng;
  }

  async tick(ctx: PropContext): Promise<OddsTick> {
    const rng = this.rngFor(ctx.propId);
    let s = this.state.get(ctx.propId);
    if (!s) {
      s = { probOver: ctx.statBaselineProbability, platformProbOver: ctx.statBaselineProbability };
      this.state.set(ctx.propId, s);
    }

    const big = rng() < 0.15;
    const step = (rng() - 0.5) * (big ? 0.08 : 0.018);
    s.probOver = clamp(s.probOver + step, 0.05, 0.95);
    // platform multiplier lags the true move — an EMA with a slow pull factor
    s.platformProbOver = clamp(s.platformProbOver + (s.probOver - s.platformProbOver) * 0.35, 0.05, 0.95);

    const bookQuotes: BookQuote[] = SPORTSBOOKS.map(({ name, weight }) => {
      const sharpness = weight / 3; // Pinnacle=1.0, retail books smaller
      const idiosyncratic = (rng() - 0.5) * 0.03 * (1 - sharpness * 0.6);
      const bookProbOver = clamp(s!.probOver + idiosyncratic, 0.03, 0.97);
      const vig = 1.03 + (1 - sharpness) * 0.035 + rng() * 0.01; // sharp books hold less
      const pOverRaw = bookProbOver * vig;
      const pUnderRaw = (1 - bookProbOver) * vig;
      return {
        book: name,
        priceOver: round(1 / pOverRaw),
        priceUnder: round(1 / pUnderRaw),
        weight,
        observedAt: new Date().toISOString(),
      };
    });

    const margin = 0.965; // platform holds ~3.5%
    const platformMultiplier: Record<Side, number> = {
      over: round(margin / s.platformProbOver),
      under: round(margin / (1 - s.platformProbOver)),
    };

    return { bookQuotes, platformMultiplier };
  }
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
