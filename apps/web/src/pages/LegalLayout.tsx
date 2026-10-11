import { useEffect } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import AttendifyWordmark from '@/components/AttendifyWordmark';

export interface LegalSection { heading: string; body: string; }

interface Props {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/** Shared shell for the public legal/help pages (Privacy, Terms). No login. */
export default function LegalLayout({ title, updated, intro, sections }: Props) {
  useEffect(() => { document.title = `Attendify — ${title}`; }, [title]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <AttendifyWordmark size={20} float={false} />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">Legal</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="hidden sm:inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-sm font-medium px-2 py-1">
              <ArrowLeft size={16} /> Home
            </a>
            <a href="/login/org-admin" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#23286b] text-white text-sm font-semibold hover:opacity-90">
              Launch App <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 pt-12 pb-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">{title}</h1>
        <p className="text-sm text-slate-400 mt-2">Last updated: {updated}</p>
        <p className="text-slate-600 leading-relaxed mt-5">{intro}</p>

        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-lg font-bold text-slate-900">{i + 1}. {s.heading}</h2>
              <p className="text-slate-600 leading-relaxed mt-2 whitespace-pre-line">{s.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl p-6 bg-gradient-to-br from-[#23286b] to-indigo-600 text-white">
          <p className="font-semibold">Questions about this policy?</p>
          <p className="text-white/80 text-sm mt-1">Open the assistant on our home page or reach us through the contact section.</p>
          <a href="/" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-white text-[#23286b] text-sm font-semibold hover:bg-white/90">
            Back to home <ChevronRight size={16} />
          </a>
        </div>

        <div className="mt-8 flex gap-4 text-sm text-slate-500">
          <a href="/docs" className="hover:text-indigo-600">Docs</a>
          <a href="/privacy" className="hover:text-indigo-600">Privacy</a>
          <a href="/terms" className="hover:text-indigo-600">Terms</a>
        </div>
      </div>
    </div>
  );
}
