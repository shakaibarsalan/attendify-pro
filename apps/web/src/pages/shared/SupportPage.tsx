import { useEffect, useState } from 'react';
import { queriesApi } from '@/lib/api';
import { LifeBuoy, Send } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'technical', label: 'Technical' },
  { value: 'account', label: 'Account' },
  { value: 'other', label: 'Other' },
];

interface QueryItem {
  id: string; subject: string; category: string; message: string; status: string;
  aboutUserName?: string | null;
  adminResponse?: string | null; respondedByName?: string | null;
  createdAt: string;
}
interface DirUser { id: string; fullName: string; role: string; }

export default function SupportPage() {
  const [form, setForm] = useState({ subject: '', category: 'other', message: '', aboutUserId: '' });
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadQueries = () => {
    queriesApi.list()
      .then((r: any) => setQueries(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQueries();
    queriesApi.directory().then((r: any) => setDirectory(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) { toast.error('Please add a subject and a message.'); return; }
    setSubmitting(true);
    try {
      await queriesApi.create({
        subject: form.subject,
        category: form.category,
        message: form.message,
        aboutUserId: form.aboutUserId || null,
      });
      toast.success('Your query was submitted to the admin.');
      setForm({ subject: '', category: 'other', message: '', aboutUserId: '' });
      loadQueries();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to submit query');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><LifeBuoy size={24} /> Help &amp; Support</h1>
        <p className="text-gray-500 mt-1">Send a query to your administrator. Optionally reference the person it concerns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Submit form */}
        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">New query</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject *</label>
            <input type="text" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Brief summary" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">About (optional)</label>
              <select value={form.aboutUserId} onChange={(e) => setForm({ ...form, aboutUserId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                <option value="">No one in particular</option>
                {directory.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role.replace('_', ' ')})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message *</label>
            <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Describe your query in detail..." />
            <p className="text-[11px] text-gray-400 mt-1">The “About” reference just helps the admin know who the query concerns. It’s optional.</p>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              <Send size={16} /> {submitting ? 'Submitting...' : 'Submit query'}
            </button>
          </div>
        </form>

        {/* My queries */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">My queries</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
          ) : queries.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">You haven't submitted any queries yet.</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
              {queries.map((q) => (
                <div key={q.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{q.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">{q.category}{q.aboutUserName ? ` · about ${q.aboutUserName}` : ''}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${q.status === 'resolved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {q.status === 'resolved' ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{q.message}</p>
                  {q.adminResponse && (
                    <div className="mt-3 rounded-lg bg-primary-50 border border-primary-100 p-3">
                      <p className="text-[11px] font-semibold text-primary-700 uppercase tracking-wide">Admin reply{q.respondedByName ? ` · ${q.respondedByName}` : ''}</p>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{q.adminResponse}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-2">{new Date(q.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
