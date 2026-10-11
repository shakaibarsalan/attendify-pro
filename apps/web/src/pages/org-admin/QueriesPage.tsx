import { useEffect, useState } from 'react';
import { queriesApi } from '@/lib/api';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';

interface QueryItem {
  id: string; subject: string; category: string; message: string; status: string;
  createdByName?: string | null; createdByRole?: string | null;
  aboutUserName?: string | null; aboutUserRole?: string | null;
  adminResponse?: string | null; respondedByName?: string | null;
  createdAt: string;
}

export default function QueriesPage() {
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const params = filter === 'all' ? undefined : { status: filter };
    queriesApi.list(params)
      .then((r: any) => setQueries(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openItem = (q: QueryItem) => {
    if (expanded === q.id) { setExpanded(null); return; }
    setExpanded(q.id);
    setReply(q.adminResponse || '');
  };

  const saveReply = async (q: QueryItem, markResolved: boolean) => {
    const data: { adminResponse?: string; status?: 'open' | 'resolved' } = {};
    if (reply.trim() !== (q.adminResponse || '')) data.adminResponse = reply.trim();
    if (markResolved) data.status = 'resolved';
    if (!data.adminResponse && !data.status) { toast('Nothing to update'); return; }
    setSaving(true);
    try {
      await queriesApi.update(q.id, data);
      toast.success(markResolved ? 'Reply saved · marked resolved' : 'Reply saved');
      setExpanded(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const reopen = async (q: QueryItem) => {
    try { await queriesApi.update(q.id, { status: 'open' }); toast.success('Reopened'); load(); }
    catch { toast.error('Failed to reopen'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Inbox size={24} /> Support Queries</h1>
          <p className="text-gray-500 mt-1">Queries submitted by your students and teachers.</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['open', 'resolved', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize ${filter === f ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : queries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No {filter === 'all' ? '' : filter} queries.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {queries.map((q) => (
              <div key={q.id}>
                <div className="px-5 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => openItem(q)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{q.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        From <span className="font-medium text-gray-700">{q.createdByName}</span> ({q.createdByRole})
                        <span className="capitalize"> · {q.category}</span>
                        {q.aboutUserName ? <> · about <span className="font-medium text-gray-700">{q.aboutUserName}</span> ({q.aboutUserRole})</> : null}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${q.status === 'resolved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {q.status === 'resolved' ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                </div>
                {expanded === q.id && (
                  <div className="px-5 pb-5 bg-gray-50 space-y-3">
                    <div className="rounded-lg bg-white border border-gray-200 p-3">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Message</p>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{q.message}</p>
                      <p className="text-[11px] text-gray-400 mt-2">{new Date(q.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Reply</label>
                      <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        placeholder="Write a reply the sender will see..." />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {q.status === 'resolved' && (
                        <button onClick={() => reopen(q)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Reopen</button>
                      )}
                      <button onClick={() => saveReply(q, false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50">Save reply</button>
                      {q.status !== 'resolved' && (
                        <button onClick={() => saveReply(q, true)} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">Reply &amp; resolve</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
