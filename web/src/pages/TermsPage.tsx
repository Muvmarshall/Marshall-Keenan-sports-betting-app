import { LegalPage } from './LegalPage.js';

const SECTIONS = [
  { heading: 'What this product is', note: 'Placeholder — describe the research-tool scope and that it does not accept wagers.' },
  { heading: 'Eligibility', note: 'Placeholder — age and jurisdiction requirements, tied to the age gate on first visit.' },
  { heading: 'No wagering, no sportsbook relationship', note: 'Placeholder — clarify this product places no bets and holds no funds.' },
  { heading: 'Data accuracy', note: 'Placeholder — disclaim that odds and statistics may be delayed, mock, or incomplete; point to the verification endpoint and source attribution instead of a blanket accuracy claim.' },
  { heading: 'Acceptable use', note: 'Placeholder — restrictions on scraping, reselling, or automated abuse of the API.' },
  { heading: 'Changes to these terms', note: 'Placeholder — how and when this document is updated.' },
  { heading: 'Contact', note: 'Placeholder — how to reach the operator with questions.' },
];

export function TermsPage() {
  return <LegalPage title="Terms" sections={SECTIONS} />;
}
