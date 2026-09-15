import { MockOddsProvider } from './mockProvider.js';
import { TheOddsApiProvider } from './theOddsApiProvider.js';
import type { OddsProvider } from './types.js';

export * from './types.js';
export { TheOddsApiProvider } from './theOddsApiProvider.js';
export { LiveOddsProviderStub } from './liveProviderStub.js';

let singleton: OddsProvider | null = null;

// TheOddsApiProvider's constructor throws a clear, specific error if ODDS_API_KEY
// is missing — deliberately not caught here, so a misconfigured live deploy fails
// loudly at startup instead of quietly falling back to a different provider.
export function getOddsProvider(): OddsProvider {
  if (!singleton) {
    singleton = process.env.ODDS_PROVIDER === 'live' ? new TheOddsApiProvider() : new MockOddsProvider();
  }
  return singleton;
}
