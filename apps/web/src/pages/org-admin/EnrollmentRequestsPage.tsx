import { useEffect, useState } from 'react';
import { enrollmentRequestsApi } from '@/lib/api';
import { UserPlus, CheckCircle2, XCircle, Clock, Loader2, Inbox } from 'lucide-react';
import { toast } from 'sonner';

const statusBadge = (s: string) =>
  s === 'approved' ? 'bg-green-50 text-green-700'
  : s === 'rejected' ? 'bg-red-50 text-red-600'
  : 'bg-yellow-50 text-yellow-700';

export default function EnrollmentRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    enrollmentRequestsApi.list().then((r: any) => setRequests(Array.isArray(r) ? r : [])).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const review = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    try {
      await enrollmentRequestsApi.review(id, status);
      toast.success(status === 'approved' ? 'Student enrolled' : 'Request rejected');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update request');
    } finally {
      setBusy(null);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enrollment Requests</h1>
        <p className="text-gray-500 mt-1">Teachers' requests to add students to their sections</p>
      </div>

      {/* Pending */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <Inbox size={18} className="text-primary-600" />
          <h2 className="font-semibold text-gray-900">Pending</h2>
          {pending.length > 0 && <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{pending.length}</span>}
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No pending requests</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pending.map((r: any) => (
              <div key={r.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    Add <span className="text-primary-700">{r.studentName}</span> {r.rollNumber ? <span className="text-gray-400 font-normal">({r.rollNumber})</span> : null}
                  </p>
                  <p className="text-sm text-gray-600">
                    to <span className="font-medium">{r.courseName}</span> ({r.courseCode}{r.section ? ` · ${r.section}` : ''})
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested by {r.teacherName}{r.studentDepartment ? ` · ${r.studentDepartment}` : ''}{r.note ? ` — "${r.note}"` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => review(r.id, 'rejected')} disabled={busy === r.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                    <XCircle size={15} /> Reject
                  </button>
                  <button onClick={() => review(r.id, 'approved')} disabled={busy === r.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {busy === r.id ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Approve &amp; enroll
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviewed history */}
      {reviewed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200"><h2 className="font-semibold text-gray-900">History</h2></div>
          <div className="divide-y divide-gray-50">
            {reviewed.map((r: any) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.studentName} <span className="text-gray-400 font-normal">→ {r.courseName} ({r.courseCode})</span></p>
                  <p className="text-xs text-gray-400">by {r.teacherName}{r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleDateString()}` : ''}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusBadge(r.status)}`}>
                  {r.status === 'approved' ? <CheckCircle2 size={12} /> : r.status === 'rejected' ? <XCircle size={12} /> : <Clock size={12} />}
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
