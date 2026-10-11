import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, ChevronRight, HelpCircle } from 'lucide-react';
import AttendifyWordmark from '@/components/AttendifyWordmark';

interface Section { id: string; title: string; body: string; }
interface Faq { q: string; a: string; }

/**
 * Public, no-login documentation & help page (served at /docs). Content comes from
 * the server's curated, personal-info-free knowledge base — the same source the
 * landing-page assistant uses to answer questions.
 */
export default function DocsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [active, setActive] = useState('');

  useEffect(() => {
    document.title = 'Attendify — Docs & Help';
    fetch('/api/chat/knowledge')
      .then((r) => r.json())
      .then((d) => { setSections(d.sections ?? []); setFaqs(d.faqs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Scroll-spy: highlight the section currently in view in the sidebar.
  useEffect(() => {
    if (!sections.length) return;
    const ids = [...sections.map((s) => s.id), 'faq'];
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      {/* Top bar with the Attendify logo */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <AttendifyWordmark size={20} float={false} />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">Docs</span>
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

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-5 pt-12 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Help Center</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">Everything you need to know about Attendify</h1>
        <p className="text-slate-500 mt-3 max-w-2xl">
          How attendance works, how we stop proxy attendance, how your biometric data is protected, and answers to common
          questions. Still stuck? Open the assistant on the home page for an instant answer.
        </p>
      </div>

      {loading ? (
        <div className="max-w-6xl mx-auto px-5 py-20 text-center text-slate-400">Loading…</div>
      ) : (
        <div className="max-w-6xl mx-auto px-5 pb-24 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-10">
          {/* Improved sticky sidebar with scroll-spy */}
          <nav className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-2">Contents</p>
              <div className="relative pl-3 border-l border-slate-200 space-y-0.5">
                {sections.map((s) => {
                  const on = active === s.id;
                  return (
                    <a key={s.id} href={`#${s.id}`}
                      className={`relative block pl-3 pr-3 py-1.5 rounded-lg text-sm transition-all ${
                        on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}>
                      {on && <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-full bg-indigo-500" />}
                      {s.title}
                    </a>
                  );
                })}
                <a href="#faq"
                  className={`relative block pl-3 pr-3 py-1.5 rounded-lg text-sm transition-all ${
                    active === 'faq' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}>
                  {active === 'faq' && <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-full bg-indigo-500" />}
                  FAQ
                </a>
              </div>

              <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
                <p className="text-xs font-semibold text-indigo-900">Need a quick answer?</p>
                <a href="/" className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium mt-1 hover:underline">
                  Ask the assistant <ChevronRight size={13} />
                </a>
              </div>
            </div>
          </nav>

          {/* Content */}
          <div className="min-w-0 space-y-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm">
                  <h2 className="text-xl font-bold text-slate-900">{s.title}</h2>
                  <p className="text-slate-600 leading-relaxed mt-3 whitespace-pre-line">{s.body}</p>
                </div>
              </section>
            ))}

            <section id="faq" className="scroll-mt-24">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle size={20} className="text-indigo-500" />
                <h2 className="text-xl font-bold text-slate-900">Frequently asked questions</h2>
              </div>
              <div className="space-y-2.5">
                {faqs.map((f, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                      <span className="font-medium text-slate-800">{f.q}</span>
                      <ChevronRight size={18} className={`text-slate-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
                    </button>
                    {openFaq === i && (
                      <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{f.a}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="rounded-2xl p-6 sm:p-7 bg-gradient-to-br from-[#23286b] to-indigo-600 text-white">
              <div className="flex items-center gap-2 font-semibold"><MessageCircle size={18} /> Still have a question?</div>
              <p className="text-white/80 text-sm mt-1.5">Open the Attendify assistant on our home page for an instant, friendly answer.</p>
              <a href="/" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-white text-[#23286b] text-sm font-semibold hover:bg-white/90">
                Ask the assistant <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
