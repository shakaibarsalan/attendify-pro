import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore,
  isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock } from 'lucide-react';

type Accent = 'blue' | 'emerald';

interface DateTimePickerProps {
  value: Date;
  onChange: (d: Date) => void;
  label?: string;
  minDate?: Date;
  accent?: Accent;
}

const accents: Record<Accent, { grad: string; ring: string; soft: string; text: string; dot: string }> = {
  blue: {
    grad: 'from-blue-600 to-indigo-600',
    ring: 'ring-blue-500',
    soft: 'bg-blue-50 text-blue-700',
    text: 'text-blue-600',
    dot: 'bg-blue-600',
  },
  emerald: {
    grad: 'from-emerald-600 to-teal-600',
    ring: 'ring-emerald-500',
    soft: 'bg-emerald-50 text-emerald-700',
    text: 'text-emerald-600',
    dot: 'bg-emerald-600',
  },
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DateTimePicker({ value, onChange, label, minDate, accent = 'blue' }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value));
  const wrapRef = useRef<HTMLDivElement>(null);
  const a = accents[accent];

  useEffect(() => {
    if (open) setViewMonth(startOfMonth(value));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  }), [viewMonth]);

  const minDay = minDate ? startOfDay(minDate) : null;

  const pickDay = (day: Date) => {
    const next = new Date(day);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  };

  const hours12 = value.getHours() % 12 || 12;
  const minutes = value.getMinutes();
  const isPM = value.getHours() >= 12;

  const setTime = (h12: number, m: number, pm: boolean) => {
    const next = new Date(value);
    const h24 = (h12 % 12) + (pm ? 12 : 0);
    next.setHours(h24, ((m % 60) + 60) % 60, 0, 0);
    onChange(next);
  };

  const stepHour = (dir: 1 | -1) => setTime(((hours12 - 1 + dir + 12) % 12) + 1, minutes, isPM);
  const stepMin = (dir: 1 | -1) => {
    let m = minutes + dir * 5;
    let pm = isPM; let h = hours12;
    if (m >= 60) { m -= 60; h = (h % 12) + 1; if (h === 12) pm = !pm; }
    if (m < 0) { m += 60; h = h - 1 || 12; if (h === 11) pm = !pm; }
    setTime(h, m, pm);
  };

  return (
    <div className="relative" ref={wrapRef}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`group w-full flex items-center gap-3 px-3.5 py-2.5 bg-white border rounded-xl text-left transition-all ${
          open ? `border-transparent ring-2 ${a.ring} shadow-sm` : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${a.soft}`}>
          <Calendar size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 leading-tight">{format(value, 'EEE, MMM d')}</span>
          <span className="block text-xs text-gray-500">{format(value, 'h:mm a')}</span>
        </span>
        <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-50 mt-2 w-[19rem] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden"
          >
            {/* Header preview */}
            <div className={`bg-gradient-to-r ${a.grad} px-4 py-3 text-white`}>
              <p className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">{format(value, 'EEEE')}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold leading-none">{format(value, 'MMM d')}</p>
                <p className="text-sm font-medium text-white/90 ml-auto">{format(value, 'h:mm a')}</p>
              </div>
            </div>

            {/* Calendar */}
            <div className="px-3 pt-3">
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><ChevronLeft size={18} /></button>
                <p className="text-sm font-semibold text-gray-800">{format(viewMonth, 'MMMM yyyy')}</p>
                <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><ChevronRight size={18} /></button>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {days.map((day) => {
                  const selected = isSameDay(day, value);
                  const outside = !isSameMonth(day, viewMonth);
                  const disabled = minDay ? isBefore(startOfDay(day), minDay) : false;
                  const today = isToday(day);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickDay(day)}
                      className={`relative h-9 rounded-lg text-sm font-medium transition-all
                        ${selected ? `bg-gradient-to-br ${a.grad} text-white shadow-md scale-105` : ''}
                        ${!selected && !disabled ? 'text-gray-700 hover:bg-gray-100' : ''}
                        ${outside && !selected ? 'text-gray-300' : ''}
                        ${disabled ? 'text-gray-200 cursor-not-allowed' : ''}`}
                    >
                      {format(day, 'd')}
                      {today && !selected && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${a.dot}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time */}
            <div className="px-3 py-3 mt-1 border-t border-gray-100 flex items-center gap-2">
              <Clock size={16} className="text-gray-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <TimeStepper value={String(hours12).padStart(2, '0')} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} />
                <span className="text-xl font-bold text-gray-300">:</span>
                <TimeStepper value={String(minutes).padStart(2, '0')} onUp={() => stepMin(1)} onDown={() => stepMin(-1)} />
              </div>
              <div className="ml-auto flex flex-col gap-1">
                {(['AM', 'PM'] as const).map((p) => {
                  const active = (p === 'PM') === isPM;
                  return (
                    <button key={p} type="button" onClick={() => setTime(hours12, minutes, p === 'PM')}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-colors ${
                        active ? `bg-gradient-to-r ${a.grad} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>{p}</button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className={`ml-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r ${a.grad} hover:opacity-90`}>
                Done
              </button>
            </div>

            {/* Manual entry */}
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Or enter manually</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={format(value, 'yyyy-MM-dd')}
                  min={minDay ? format(minDay, 'yyyy-MM-dd') : undefined}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const next = new Date(value);
                    next.setFullYear(y, m - 1, d);
                    onChange(next);
                  }}
                  className={`flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 ${a.ring}`}
                />
                <input
                  type="time"
                  value={format(value, 'HH:mm')}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [h, mi] = e.target.value.split(':').map(Number);
                    const next = new Date(value);
                    next.setHours(h, mi, 0, 0);
                    onChange(next);
                  }}
                  className={`px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 ${a.ring}`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimeStepper({ value, onUp, onDown }: { value: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={onUp} className="text-gray-300 hover:text-gray-600"><ChevronUp size={15} /></button>
      <span className="w-9 text-center text-lg font-bold text-gray-900 tabular-nums select-none">{value}</span>
      <button type="button" onClick={onDown} className="text-gray-300 hover:text-gray-600"><ChevronDown size={15} /></button>
    </div>
  );
}
