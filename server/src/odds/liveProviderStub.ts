import type { OddsProvider, OddsTick, PropContext } from './types.js';

/**
 * Stub for a live odds feed (e.g. The Odds API, SportsDataIO). Swapping this in is a
 * one-file change: implement `tick` to fetch real book prices for the given prop and
 * map them into the same OddsTick shape MockOddsProvider returns. Nothing outside
 * this file needs to change — routes, the poller, and the seed script all depend on
 * the OddsProvider interface, not on which implementation is wired up.
 */
export class LiveOddsProviderStub implements OddsProvider {
  tick(_ctx: PropContext): OddsTick {
    throw new Error(
      'LiveOddsProviderStub.tick() is not implemented. Wire a real odds feed here and set ODDS_PROVIDER=live.',
    );
  }
}
