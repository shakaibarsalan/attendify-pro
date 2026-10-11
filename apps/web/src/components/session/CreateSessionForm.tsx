import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, ScanFace, QrCode, Fingerprint, Check } from 'lucide-react';
import { toast } from 'sonner';
import { sessionsApi } from '@/lib/api';
import DateTimePicker from '@/components/ui/DateTimePicker';

// Round a date up to the next 5-minute mark for tidy default times.
function roundUp5(d: Date) {
  const r = new Date(d);
  r.setSeconds(0, 0);
  r.setMinutes(Math.ceil(r.getMinutes() / 5) * 5);
  return r;
}
function defaultTimes() {
  const start = roundUp5(new Date());
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h dummy window
  return { start, end };
}
function fmtDuration(ms: number) {
  if (ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h ` : ''}${m ? `${m}m` : h ? '' : '0m'}`.trim();
}

interface Props {
  courses: any[];
  onCancel: () => void;
  onCreated: () => void;
}

export default function CreateSessionForm({ courses, onCancel, onCreated }: Props) {
  const t0 = defaultTimes();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    courseId: '',
    startTime: t0.start,
    endTime: t0.end,
    allowFace: true,
    allowFingerprint: false,
    requireLiveness: true,
    requireQr: true,
    notes: '',
  });

  const setDuration = (minutes: number) =>
    setForm((f) => ({ ...f, endTime: new Date(f.startTime.getTime() + minutes * 60000) }));

  const toggleMethod = (key: 'allowFace' | 'allowFingerprint') =>
    setForm((f) => ({ ...f, [key]: !f[key] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId) { toast.error('Please select a course'); return; }
    if (form.endTime <= form.startTime) { toast.error('End time must be after the start time'); return; }
    if (!form.allowFace && !form.allowFingerprint) {
      toast.error('Enable at least one check-in method (Face or Fingerprint)'); return;
    }
    setCreating(true);
    try {
      await sessionsApi.create({
        courseId: form.courseId,
        startTime: form.startTime.toISOString(),
        endTime: form.endTime.toISOString(),
        allowFace: form.allowFace,
        allowFingerprint: form.allowFingerprint,
        allowQr: false,
        requireBiometric: form.allowFace,
        requireLiveness: form.allowFace && form.requireLiveness,
        requireQr: form.requireQr,
        notes: form.notes || undefined,
      });
      toast.success('Session created! Students can now mark their attendance.');
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Create Attendance Session</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Course */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Course *</label>
          <select required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
            <option value="">Select course...</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Schedule</label>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
              <Clock size={12} /> {fmtDuration(form.endTime.getTime() - form.startTime.getTime())}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateTimePicker
              label="Starts" accent="blue" value={form.startTime}
              onChange={(d) => setForm((f) => ({
                ...f, startTime: d,
                endTime: f.endTime <= d ? new Date(d.getTime() + 60 * 60000) : f.endTime,
              }))}
            />
            <DateTimePicker
              label="Ends" accent="emerald" value={form.endTime} minDate={form.startTime}
              onChange={(d) => setForm((f) => ({ ...f, endTime: d }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-gray-400">Quick set:</span>
            {[30, 60, 90, 120].map((m) => {
              const active = Math.round((form.endTime.getTime() - form.startTime.getTime()) / 60000) === m;
              return (
                <button key={m} type="button" onClick={() => setDuration(m)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Allowed methods */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Allowed check-in methods *</label>
          <p className="text-xs text-gray-400 mb-2.5">Choose how students may mark attendance for this session.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MethodCard icon={<ScanFace size={20} />} title="Face" desc="AI face recognition"
              active={form.allowFace} onClick={() => toggleMethod('allowFace')} />
            <MethodCard icon={<Fingerprint size={20} />} title="Fingerprint" desc="Fingertip photo (camera)"
              active={form.allowFingerprint} onClick={() => toggleMethod('allowFingerprint')} />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3">
            {form.allowFace && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.requireLiveness}
                  onChange={(e) => setForm({ ...form, requireLiveness: e.target.checked })}
                  className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Require liveness check (anti-spoof)</span>
              </label>
            )}
          </div>
        </div>

        {/* Live-QR presence gate */}
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.requireQr}
              onChange={(e) => setForm({ ...form, requireQr: e.target.checked })}
              className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <QrCode size={16} /> Require live-QR presence check
              </span>
              <span className="block text-xs text-indigo-700 mt-0.5">
                Shows a QR that rotates every 5 seconds on your screen/projector. Students must scan the
                live code (proving they're physically in the room) before they can mark with face or
                fingerprint — this defeats QR sharing and proxy attendance.
              </span>
            </span>
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. Midterm review, Lab session..." />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={creating} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-50">
            {creating ? 'Creating...' : 'Start Session'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

function MethodCard({ icon, title, desc, active, onClick, badge }: {
  icon: React.ReactNode; title: string; desc: string; active: boolean; onClick: () => void; badge?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`relative text-left rounded-xl border p-3.5 transition-all ${
        active ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500 shadow-sm'
               : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-primary-600 text-white' : 'bg-gray-200 text-transparent'
      }`}>
        <Check size={13} strokeWidth={3} />
      </span>
      <span className={`inline-flex w-10 h-10 rounded-lg items-center justify-center mb-2 ${
        active ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
      }`}>{icon}</span>
      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
        {title}
        {badge && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{badge}</span>}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </button>
  );
}
