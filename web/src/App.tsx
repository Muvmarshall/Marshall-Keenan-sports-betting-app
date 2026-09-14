import { Route, Routes } from 'react-router-dom';
import { TodayPage } from './pages/TodayPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';
import { Footer } from './components/Footer.js';
import { UsageNotice } from './components/UsageNotice.js';

export default function App() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[720px] bg-ground pb-[env(safe-area-inset-bottom,0px)]">
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/games/:id" element={<GameDetailPage />} />
      </Routes>
      <Footer />
      <UsageNotice />
    </div>
  );
}
