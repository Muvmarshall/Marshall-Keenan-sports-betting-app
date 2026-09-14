import { MockOddsProvider } from './mockProvider.js';
import { LiveOddsProviderStub } from './liveProviderStub.js';
import type { OddsProvider } from './types.js';

export * from './types.js';

let singleton: OddsProvider | null = null;

export function getOddsProvider(): OddsProvider {
  if (!singleton) {
    singleton = process.env.ODDS_PROVIDER === 'live' ? new LiveOddsProviderStub() : new MockOddsProvider();
  }
  return singleton;
}
