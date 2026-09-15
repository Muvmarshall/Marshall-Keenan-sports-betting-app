import { Route, Routes } from 'react-router-dom';
import { TodayPage } from './pages/TodayPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';
import { VerifyPage } from './pages/VerifyPage.js';
import { ResultsPage } from './pages/ResultsPage.js';
import { TermsPage } from './pages/TermsPage.js';
import { PrivacyPage } from './pages/PrivacyPage.js';
import { Footer } from './components/Footer.js';
import { UsageNotice } from './components/UsageNotice.js';
import { FeedBanner } from './components/FeedBanner.js';
import { FeedStatusProvider } from './context/FeedStatusContext.js';
import { AgeGate } from './components/AgeGate.js';

export default function App() {
  return (
    <FeedStatusProvider>
      <div className="mx-auto min-h-screen w-full max-w-[720px] bg-ground pb-[env(safe-area-inset-bottom,0px)]">
        <FeedBanner />
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/games/:id" element={<GameDetailPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
        <Footer />
        <UsageNotice />
        <AgeGate />
      </div>
    </FeedStatusProvider>
  );
}
