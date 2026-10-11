import { useEffect, useState } from 'react';
import { auditApi } from '@/lib/api';
import { FileText } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    auditApi.list({ page, limit })
      .then((res: any) => {
        const d = res.data ?? res;
        setLogs(Array.isArray(d) ? d : []);
        setTotal(res.total ?? d?.length ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  const getActionColor = (action: string) => {
    if (action?.includes('login') || action?.includes('create')) return 'bg-green-50 text-green-700';
    if (action?.includes('delete') || action?.includes('deactivate')) return 'bg-red-50 text-red-700';
    if (action?.includes('update') || action?.includes('change')) return 'bg-blue-50 text-blue-700';
    return 'bg-gray-50 text-gray-700';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-gray-500 mt-1">System activity log</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileText size={20} /> Activity Log</h2>
          <span className="text-sm text-gray-500">{total} entries</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No audit logs found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Timestamp</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">User</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Action</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Entity</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log: any, i: number) => (
                    <tr key={log.id || i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        <p className="font-medium">{log.userName || log.userEmail || 'Unknown'}</p>
                        <p className="text-xs text-gray-400 capitalize">{(log.userRole || '').replace('_', ' ')}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                          {log.action || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {log.entityType || '—'} / {(log.entityId || '').substring(0, 8)}...
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 font-mono">{log.ipAddress || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <div className="px-5 border-t border-gray-200">
                <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
