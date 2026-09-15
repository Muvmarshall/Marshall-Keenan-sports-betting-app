import { LegalPage } from './LegalPage.js';

const SECTIONS = [
  { heading: 'What is stored, and where', note: 'Placeholder — the slip and age-gate acknowledgment live in this browser\'s localStorage under an anonymous client id; no accounts exist. Describe what, if anything, the server retains (slip snapshots for track-record purposes).' },
  { heading: 'What is never collected', note: 'Placeholder — no accounts, no payment info, no real name tied to slip data. Confirm slip contents are never sent to third-party analytics (see README "Operations").' },
  { heading: 'Third parties', note: 'Placeholder — the odds provider and any data source (e.g. nflverse) that requests reach, and what they can see (IP, request pattern) as a normal consequence of the request.' },
  { heading: 'Your choices', note: 'Placeholder — clearing localStorage removes the local slip and age-gate acknowledgment entirely.' },
  { heading: 'Changes to this policy', note: 'Placeholder — how and when this document is updated.' },
  { heading: 'Contact', note: 'Placeholder — how to reach the operator with questions.' },
];

export function PrivacyPage() {
  return <LegalPage title="Privacy" sections={SECTIONS} />;
}
