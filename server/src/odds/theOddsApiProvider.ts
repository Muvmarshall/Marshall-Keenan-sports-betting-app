import type { BookQuote, Side, StatType } from '@parlay/shared';
import type { OddsProvider, OddsTick, PropContext } from './types.js';

/**
 * Real implementation against The Odds API v4 (the-odds-api.com). Written from
 * documented knowledge of that API, NOT verified against a live response — this
 * sandbox's network egress policy blocks the-odds-api.com, so I could not fetch
 * their docs or a sample response before writing this. Test against a real
 * ODDS_API_KEY before trusting it, and start here if something breaks:
 *
 *   curl "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/EVENT_ID/odds\
 *   ?apiKey=YOUR_KEY&regions=us&markets=player_pass_yds&oddsFormat=decimal"
 *
 * and compare the response shape to `EventOddsResponse` below. The market-key
 * strings in STAT_TYPE_TO_MARKET are the most likely point of drift.
 *
 * What this does NOT do: player props aren't in the bulk /v4/sports/{sport}/odds
 * endpoint, only per-event via /events/{eventId}/odds, and each market you
 * request there costs against your quota — see README "Live odds feed" for the
 * request-budget math before shortening POLL_INTERVAL_MS.
 *
 * Reinterprets "platform multiplier": there's no real pick'em-platform feed to
 * compare against, so one representative retail book stands in for "platform"
 * and the fair probability is the consensus of every OTHER book returned. The
 * edge this produces is a real line-shopping signal (is this book mispriced
 * relative to the rest of the market), not "our own product's payout vs the
 * market" the way the mock's edge is. See README for why.
 */

const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT_KEY = 'americanfootball_nfl';
const EVENTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // the week's schedule barely changes
const EVENT_ODDS_CACHE_TTL_MS = 90 * 1000; // reused across every prop in the same game/tick

// VERIFY against a real response — these are The Odds API's documented player-prop
// market keys as of this code being written, not confirmed live.
const STAT_TYPE_TO_MARKET: Partial<Record<StatType, string>> = {
  pass_yds: 'player_pass_yds',
  rush_yds: 'player_rush_yds',
  rec_yds: 'player_reception_yds',
  receptions: 'player_receptions',
  pass_tds: 'player_pass_tds',
  rush_tds: 'player_rush_tds',
  rec_tds: 'player_reception_tds',
  // team_total has no player-prop equivalent on this feed — see README.
};

const SHARP_BOOKS = new Set(['pinnacle', 'circa']);
const PREFERRED_PLATFORM_STANDIN = 'draftkings';

// Our internal team abbreviations vs. this API's full team names.
const ABBREV_TO_FULL_NAME: Record<string, string> = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers',
  SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};

interface ExternalEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}

interface EventOddsResponse {
  id: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: { name: 'Over' | 'Under'; description: string; price: number; point: number }[];
    }[];
  }[];
}

export class TheOddsApiProvider implements OddsProvider {
  private apiKey: string;
  private eventsCache: { fetchedAt: number; events: ExternalEvent[] } | null = null;
  private eventOddsCache = new Map<string, { fetchedAt: number; data: EventOddsResponse }>();
  private eventIdByGameKey = new Map<string, string>();

  constructor(apiKey = process.env.ODDS_API_KEY) {
    if (!apiKey) {
      throw new Error('ODDS_API_KEY is required when ODDS_PROVIDER=live. Get a free key at the-odds-api.com.');
    }
    this.apiKey = apiKey;
  }

  async tick(ctx: PropContext): Promise<OddsTick> {
    const marketKey = STAT_TYPE_TO_MARKET[ctx.statType];
    if (!marketKey) {
      throw new Error(`No live market mapping for stat type "${ctx.statType}" (prop ${ctx.propId}).`);
    }

    const eventId = await this.resolveEventId(ctx);
    const eventOdds = await this.fetchEventOdds(eventId, marketKey);

    const outcomesByBook: { book: string; over?: number; under?: number }[] = [];
    for (const bm of eventOdds.bookmakers) {
      const market = bm.markets.find((m) => m.key === marketKey);
      if (!market) continue;
      const over = market.outcomes.find((o) => o.name === 'Over' && matchesPlayer(o.description, ctx.playerName));
      const under = market.outcomes.find((o) => o.name === 'Under' && matchesPlayer(o.description, ctx.playerName));
      if (over || under) outcomesByBook.push({ book: bm.key, over: over?.price, under: under?.price });
    }

    if (outcomesByBook.length === 0) {
      throw new Error(
        `No "${ctx.playerName}" outcomes found in market "${marketKey}" for event ${eventId} (prop ${ctx.propId}). ` +
          `Either this player/market isn't posted right now, or the name/market-key mapping needs adjusting.`,
      );
    }

    const platformBook =
      outcomesByBook.find((b) => b.book === PREFERRED_PLATFORM_STANDIN) ?? outcomesByBook[0];
    const consensusBooks = outcomesByBook.filter((b) => b.book !== platformBook.book);
    if (consensusBooks.length === 0) {
      throw new Error(`Only one book ("${platformBook.book}") posted "${ctx.playerName}" — need at least two to compare.`);
    }

    const bookQuotes: BookQuote[] = consensusBooks
      .filter((b) => b.over !== undefined && b.under !== undefined)
      .map((b) => ({
        book: b.book,
        priceOver: b.over!,
        priceUnder: b.under!,
        weight: SHARP_BOOKS.has(b.book) ? 3 : 1,
        observedAt: new Date().toISOString(),
      }));

    if (platformBook.over === undefined || platformBook.under === undefined) {
      throw new Error(`Reference book "${platformBook.book}" is missing one side of the market for "${ctx.playerName}".`);
    }

    const platformMultiplier: Record<Side, number> = {
      over: platformBook.over,
      under: platformBook.under,
    };

    return { bookQuotes, platformMultiplier };
  }

  private async resolveEventId(ctx: PropContext): Promise<string> {
    const gameKey = `${ctx.homeTeam}:${ctx.awayTeam}:${ctx.kickoffUtc}`;
    const cached = this.eventIdByGameKey.get(gameKey);
    if (cached) return cached;

    const events = await this.fetchEvents();
    const homeFullName = ABBREV_TO_FULL_NAME[ctx.homeTeam] ?? ctx.homeTeam;
    const awayFullName = ABBREV_TO_FULL_NAME[ctx.awayTeam] ?? ctx.awayTeam;

    const match = events.find(
      (e) =>
        namesMatch(e.home_team, homeFullName) &&
        namesMatch(e.away_team, awayFullName) &&
        Math.abs(new Date(e.commence_time).getTime() - new Date(ctx.kickoffUtc).getTime()) < 6 * 60 * 60 * 1000,
    );
    if (!match) {
      throw new Error(`No live event found for ${awayFullName} at ${homeFullName} near ${ctx.kickoffUtc}.`);
    }
    this.eventIdByGameKey.set(gameKey, match.id);
    return match.id;
  }

  private async fetchEvents(): Promise<ExternalEvent[]> {
    if (this.eventsCache && Date.now() - this.eventsCache.fetchedAt < EVENTS_CACHE_TTL_MS) {
      return this.eventsCache.events;
    }
    const url = `${BASE_URL}/sports/${SPORT_KEY}/events?apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The Odds API events fetch failed: ${res.status} ${await safeText(res)}`);
    const events = (await res.json()) as ExternalEvent[];
    this.eventsCache = { fetchedAt: Date.now(), events };
    return events;
  }

  private async fetchEventOdds(eventId: string, marketKey: string): Promise<EventOddsResponse> {
    const cacheKey = `${eventId}:${marketKey}`;
    const cached = this.eventOddsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < EVENT_ODDS_CACHE_TTL_MS) {
      return cached.data;
    }
    const url =
      `${BASE_URL}/sports/${SPORT_KEY}/events/${eventId}/odds` +
      `?apiKey=${this.apiKey}&regions=us&markets=${marketKey}&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The Odds API event-odds fetch failed: ${res.status} ${await safeText(res)}`);
    const data = (await res.json()) as EventOddsResponse;
    this.eventOddsCache.set(cacheKey, { fetchedAt: Date.now(), data });
    return data;
  }
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function matchesPlayer(description: string, playerName: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.,]/g, '');
  return norm(description) === norm(playerName);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
