import { useEffect, useRef, useState } from 'react';
import { coursesApi, enrollmentRequestsApi } from '@/lib/api';
import { UserPlus, Search, Send, Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import { toast } from 'sonner';

interface Student { id: string; fullName: string; rollNumber?: string; department?: string; email?: string; }

const statusBadge = (s: string) =>
  s === 'approved' ? 'bg-green-50 text-green-700'
  : s === 'rejected' ? 'bg-red-50 text-red-600'
  : 'bg-yellow-50 text-yellow-700';

export default function EnrollmentRequestsPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [courseId, setCourseId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Student typeahead
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadRequests = () =>
    enrollmentRequestsApi.list().then((r: any) => setRequests(Array.isArray(r) ? r : [])).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    coursesApi.list().then((r: any) => setCourses(r.data ?? [])).catch(() => {});
    loadRequests();
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced student search
  useEffect(() => {
    if (selected) return; // already chosen
    const q = query.trim();
    setSearching(true);
    const t = setTimeout(() => {
      enrollmentRequestsApi.searchStudents(q)
        .then((r: any) => setResults(Array.isArray(r) ? r : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, selected]);

  const pick = (s: Student) => { setSelected(s); setQuery(`${s.fullName}${s.rollNumber ? ` (${s.rollNumber})` : ''}`); setOpen(false); };
  const clearStudent = () => { setSelected(null); setQuery(''); setResults([]); setOpen(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) return toast.error('Choose one of your courses.');
    if (!selected) return toast.error('Search and select a student.');
    setSubmitting(true);
    try {
      await enrollmentRequestsApi.create({ courseId, studentId: selected.id, note: note.trim() || undefined });
      toast.success('Request sent to your organization admin.');
      setSelected(null); setQuery(''); setNote(''); setResults([]);
      loadRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enrollment Requests</h1>
        <p className="text-gray-500 mt-1">Ask your organization admin to add a student to one of your sections</p>
      </div>

      {/* Request form */}
      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><UserPlus size={18} className="text-primary-600" /> Request to add a student</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your course / section</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Select a course…</option>
              {courses.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code}{c.section ? ` · ${c.section}` : ''})</option>
              ))}
            </select>
          </div>

          {/* Student typeahead */}
          <div ref={boxRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Student (search by ID or name)</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="e.g. 22F-BCS-001 or Ahmed"
                className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {selected && (
                <button type="button" onClick={clearStudent} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
              )}
            </div>
            {open && !selected && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {searching ? (
                  <div className="px-3 py-3 text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Searching…</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-400">No students found</div>
                ) : (
                  results.map((s) => (
                    <button type="button" key={s.id} onClick={() => pick(s)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm font-medium text-gray-900">{s.fullName}</p>
                      <p className="text-xs text-gray-500">{s.rollNumber || s.email}{s.department ? ` · ${s.department}` : ''}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Note to admin (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason for adding this student…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send request
          </button>
        </div>
      </form>

      {/* My requests */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">My requests</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No requests yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map((r: any) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.studentName} <span className="text-gray-400 font-normal">{r.rollNumber ? `· ${r.rollNumber}` : ''}</span></p>
                  <p className="text-xs text-gray-500">{r.courseName} ({r.courseCode}{r.section ? ` · ${r.section}` : ''}){r.note ? ` — ${r.note}` : ''}</p>
                  {r.adminNote && <p className="text-xs text-gray-400 mt-0.5">Admin: {r.adminNote}</p>}
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusBadge(r.status)}`}>
                  {r.status === 'approved' ? <CheckCircle2 size={12} /> : r.status === 'rejected' ? <XCircle size={12} /> : <Clock size={12} />}
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
