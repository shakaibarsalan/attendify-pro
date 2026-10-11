import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Send } from 'lucide-react';
import Mascot, { type MascotState } from './Mascot';
import styles from './Chatbot.module.css';

// Lazy: the Lottie player + robot JSON only load when the greeting fires.
const RobotGreeter = lazy(() => import('./RobotGreeter'));

interface Msg { role: 'user' | 'assistant'; content: string; intro?: boolean; }

const WELCOME =
  "Hi! I'm the Attendify assistant. Pick a question below, or type your own about how Attendify works for your workplace, privacy, or getting started.";

const INITIAL_SUGGESTIONS = [
  'What is Attendify?',
  'How do employees clock in?',
  'How does it stop buddy punching?',
  'Is our biometric data safe?',
  'How does it cut hardware cost?',
];

// Guided flow: each question reveals a relevant next set of questions, so the
// conversation keeps moving instead of stopping after one tap.
const FLOW: Record<string, string[]> = {
  'What is Attendify?': ['How do employees clock in?', 'How does it stop buddy punching?', 'Does it support multiple branches?'],
  'How do employees clock in?': ["What if a face isn't recognized?", 'How does the QR clock-in work?', 'Is our biometric data safe?'],
  'How does it stop buddy punching?': ['How does the QR clock-in work?', 'Is our biometric data safe?', "What if a face isn't recognized?"],
  'Is our biometric data safe?': ['Do employees need an app?', 'What is Attendify?', 'How does it cut hardware cost?'],
  'How does it cut hardware cost?': ['How do employees clock in?', 'Does it support multiple branches?', 'Can we export to HR or payroll?'],
  "What if a face isn't recognized?": ['How does the QR clock-in work?', 'How do employees clock in?', 'Is our biometric data safe?'],
  'How does the QR clock-in work?': ['How does it stop buddy punching?', 'How do employees clock in?', 'Do employees need an app?'],
  'Does it support multiple branches?': ['Can we export to HR or payroll?', 'How does it cut hardware cost?', 'Is our biometric data safe?'],
  'Do employees need an app?': ['How do employees clock in?', "What if a face isn't recognized?", 'How does a manager start a session?'],
  'How does a manager start a session?': ['How does the QR clock-in work?', 'Does it support multiple branches?', 'How does it stop buddy punching?'],
  'Can we export to HR or payroll?': ['Does it support multiple branches?', 'How does it cut hardware cost?', 'How do employees clock in?'],
};

const POPULAR = [
  'How do employees clock in?',
  'How does it stop buddy punching?',
  'Is our biometric data safe?',
  'How does the QR clock-in work?',
  'How does it cut hardware cost?',
  'Does it support multiple branches?',
];

// Drop em/en dashes from assistant text (replace with natural commas).
function deDash(t: string): string {
  return t.replace(/\s*[—–]\s*/g, ', ').replace(/\s+,/g, ',').replace(/,{2,}/g, ',');
}

// Safely render the assistant's light markdown (real bold + bullets, no raw "**").
function renderRich(raw: string): ReactNode {
  return deDash(raw).split('\n').map((rawLine, i) => {
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(rawLine);
    const line = bullet ? bullet[1] : rawLine;
    if (!bullet && line.trim() === '') return <div key={i} style={{ height: 6 }} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((seg, j) =>
      /^\*\*[^*]+\*\*$/.test(seg) ? <strong key={j}>{seg.slice(2, -2)}</strong> : <span key={j}>{seg}</span>
    );
    return <div key={i} className={bullet ? styles.bullet : undefined}>{parts}</div>;
  });
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(false);
  const [robotOut, setRobotOut] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Show the robot greeting whenever the chat is CLOSED — ~1s after first load,
  // and again ~1s after the visitor closes the chat. Hidden while chat is open.
  useEffect(() => {
    if (open) { setGreet(false); setRobotOut(false); return; }
    const t = window.setTimeout(() => setGreet(true), 1100);
    return () => clearTimeout(t);
  }, [open]);

  // Mascot state machine: closed -> idle, AI replying -> typing, user has text ->
  // user_typing, otherwise (open, waiting) -> listening. The same value drives the
  // launcher mascot and the header mascot.
  const mascotState: MascotState =
    !open ? 'idle' : loading ? 'typing' : input.trim().length > 0 ? 'user_typing' : 'listening';

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: WELCOME, intro: true }]);
      setSuggestions(INITIAL_SUGGESTIONS);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, suggestions]);

  const hasAsked = messages.some((m) => m.role === 'user');

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const userMsg: Msg = { role: 'user', content: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setSuggestions([]);
    setInput('');
    setLoading(true);
    try {
      const history = next.filter((m) => !m.intro).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, audience: 'organization' }),
      });
      const data = await res.json();
      const reply = res.ok && data?.reply
        ? data.reply
        : (data?.error || 'Sorry, I had trouble answering that. Please try again.');
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The assistant is briefly unavailable. Please try again in a moment.' }]);
    } finally {
      setLoading(false);
      const asked = next.filter((m) => m.role === 'user').map((m) => m.content);
      const pool = FLOW[q] || POPULAR;
      setSuggestions(pool.filter((p) => !asked.includes(p)).slice(0, 3));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const statusText = loading ? 'Typing…' : input.trim().length > 0 ? 'Listening…' : 'Online';

  return (
    <>
      <div className={`${styles.launchArea} ${open ? styles.launchHidden : ''}`}>
        {/* looping greeting: the Attendify robot pops up + says hello, repeat */}
        {greet && !open && (
          <Suspense fallback={null}>
            <RobotGreeter onOpen={() => setOpen(true)} onVisible={setRobotOut} />
          </Suspense>
        )}
        <button
          className={`${styles.launcher} ${greet && !open && robotOut ? styles.launcherGreet : ''}`}
          onClick={() => setOpen(true)}
          aria-label="Open the Attendify assistant"
        >
          <span className={styles.launcherText}>Ask Attendify</span>
        </button>
      </div>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Attendify assistant">
          <div className={styles.header}>
            <div className={styles.headerGlow} aria-hidden />
            <div className={styles.headerInner}>
              <span className={styles.headerMascot}><Mascot state={mascotState} size={46} /></span>
              <div className={styles.headerText}>
                <div className={styles.headerTitle}>Attendify Assistant</div>
                <div className={styles.headerSub}><span className={styles.liveDot} />{statusText}</div>
              </div>
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close assistant"><X size={18} /></button>
            </div>
          </div>

          <div className={styles.body} ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`${styles.row} ${m.role === 'user' ? styles.rowUser : styles.rowBot}`}>
                {m.role === 'assistant' && <span className={styles.botAvatar}><Mascot state="static" size={42} /></span>}
                <div className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleBot}`}>
                  {m.role === 'assistant' ? renderRich(m.content) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className={`${styles.row} ${styles.rowBot}`}>
                <span className={styles.botAvatar}><Mascot state="static" size={42} /></span>
                <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.typing}`}>
                  <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                </div>
              </div>
            )}

            {!loading && suggestions.length > 0 && (
              <div className={styles.suggestWrap}>
                <div className={styles.chipsLabel}>{hasAsked ? 'You might also ask' : 'Try asking'}</div>
                <div className={styles.chips}>
                  {suggestions.map((s) => (
                    <button key={s} className={styles.chip} onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form className={styles.inputBar} onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Attendify…"
              maxLength={500}
            />
            <button type="submit" className={styles.sendBtn} disabled={!input.trim() || loading} aria-label="Send">
              <Send size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
