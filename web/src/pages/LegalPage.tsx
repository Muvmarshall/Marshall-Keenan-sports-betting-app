import { useNavigate } from 'react-router-dom';

interface Section {
  heading: string;
  note: string;
}

interface LegalPageProps {
  title: string;
  sections: Section[];
}

/**
 * Structure only — the substance is intentionally not written here. Per spec:
 * "Do not write legal language." Every section is a placeholder pending real
 * legal review, and says so plainly rather than shipping invented terms.
 */
export function LegalPage({ title, sections }: LegalPageProps) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-[13px] pt-[15px]">
        <button onClick={() => navigate(-1)} className="font-cond text-lg text-ink-dim hover:text-ink" aria-label="Back">
          ←
        </button>
        <h1 className="font-cond text-[23px] font-semibold tracking-tight text-ink">{title}</h1>
      </div>

      <div className="px-[18px] pb-6">
        <p className="mb-4 rounded-card border-l-2 border-caution bg-caution-bg px-4 py-3 text-[13px] font-medium leading-relaxed text-caution">
          DRAFT — PENDING LEGAL REVIEW. This page shows the structure this document will follow. None of the section
          text below is legal language and none of it should be relied on.
        </p>

        {sections.map((s) => (
          <div key={s.heading} className="mb-3 rounded-card bg-surface px-4 py-[15px]">
            <h2 className="mb-1 font-cond text-lg font-semibold text-ink">{s.heading}</h2>
            <p className="text-[13px] leading-relaxed text-ink-faint">{s.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
