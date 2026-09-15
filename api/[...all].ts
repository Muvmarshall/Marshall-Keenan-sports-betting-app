// Vercel serverless entry point. The filename catch-all ([...all]) makes Vercel
// route every /api/* request to this one function; Express's own router inside
// app.ts still does the real path matching against the original req.url.
//
// Deliberately imports app.ts, not index.ts: index.ts calls app.listen() and
// starts the 60-second poller, neither of which is valid in a serverless
// function (there's no persistent process for setInterval to run in — see
// README "Deploying" for how odds refresh works, or doesn't, on this host).
export { app as default } from '../server/src/app.js';
