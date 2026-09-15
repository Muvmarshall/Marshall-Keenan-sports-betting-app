import type { OddsProvider, OddsTick, PropContext } from './types.js';

/**
 * Stub for a live odds feed. `TheOddsApiProvider` (theOddsApiProvider.ts) is a real
 * implementation against The Odds API's v4 contract — use that unless you're wiring
 * up a different provider, in which case this file is the shape to match.
 */
export class LiveOddsProviderStub implements OddsProvider {
  async tick(_ctx: PropContext): Promise<OddsTick> {
    throw new Error(
      'LiveOddsProviderStub.tick() is not implemented. Wire a real odds feed here and set ODDS_PROVIDER=live.',
    );
  }
}
