import { useEffect, useState } from 'react';
import { fraudApi } from '@/lib/api';
import api from '@/lib/api';
import {
  AlertTriangle, Filter, Eye, CheckCircle, XCircle,
  Shield, BarChart3, PieChart as PieIcon, TrendingUp,
} from 'lucide-react';
import Pagination from '@/components/shared/Pagination';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import type { FraudAlert } from '@/types';
import { toast } from 'sonner';

const severityColors: Record<string, string> = {
  low: 'bg-blue-50 text-blue-700',
  medium: 'bg-yellow-50 text-yellow-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  reviewed: 'bg-blue-50 text-blue-700',
  resolved: 'bg-green-50 text-green-700',
  false_positive: 'bg-gray-100 text-gray-600',
};

const SEVERITY_CHART_COLORS: Record<string, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

interface Analytics {
  total: number;
  pending: number;
  bySeverity: { severity: string; count: number }[];
  byDay: { date: string; count: number }[];
  byCourse: { course_name: string; count: number }[];
}

export default function FraudAlertsPage() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [tab, setTab] = useState<'analytics' | 'list'>('analytics');
  const limit = 20;

  const fetchAlerts = () => {
    setLoading(true);
    const params: any = { page, limit };
    if (statusFilter) params.status = statusFilter;
    if (severityFilter) params.severity = severityFilter;
    fraudApi.list(params)
      .then((res: any) => {
        setAlerts(res.data || res);
        setTotal(res.total || (Array.isArray(res.data) ? res.data.length : 0));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchAnalytics = () => {
    api.get('/fraud/analytics')
      .then((res: any) => setAnalytics(res))
      .catch(() => {});
  };

  useEffect(() => {
    fetchAlerts();
    fetchAnalytics();
  }, [statusFilter, severityFilter, page]);

  const handleResolve = async (id: string, status: string) => {
    try {
      await fraudApi.resolve(id, { status });
      toast.success(`Alert marked as ${status}`);
      fetchAlerts();
      fetchAnalytics();
      setSelectedAlert(null);
    } catch {
      toast.error('Failed to update alert');
    }
  };

  const handleBulkResolve = async () => {
    const pendingAlerts = alerts.filter((a) => a.status === 'pending');
    if (pendingAlerts.length === 0) return;
    try {
      await Promise.all(pendingAlerts.map((a) => fraudApi.resolve(a.id, { status: 'reviewed' })));
      toast.success(`${pendingAlerts.length} alerts marked as reviewed`);
      fetchAlerts();
      fetchAnalytics();
    } catch {
      toast.error('Failed to resolve alerts');
    }
  };

  const resolved = analytics ? analytics.total - analytics.pending : 0;
  const pieData = analytics?.bySeverity.map((s) => ({ name: s.severity, value: parseInt(String(s.count)) })) || [];

  // Normalize the daily series (pg returns COUNT as a string) and derive a clean
  // integer Y-axis ceiling with ~20% headroom, rounded up to an even number, so
  // the peak (which can be far higher than a quiet day) never touches the top edge.
  const dayData = analytics?.byDay.map((d) => ({ date: d.date, count: Number(d.count) || 0 })) || [];
  const dayMax = dayData.reduce((m, d) => Math.max(m, d.count), 0);
  const yMax = Math.max(4, Math.ceil((dayMax * 1.2) / 2) * 2);
  const fmtDay = (v: string) => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fraud Alerts</h1>
          <p className="text-gray-500 mt-1">Monitor and manage suspicious activity</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setTab('analytics')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'analytics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 size={14} className="inline mr-1.5" />Analytics
            </button>
            <button
              onClick={() => setTab('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <AlertTriangle size={14} className="inline mr-1.5" />Alert List
            </button>
          </div>
          <button
            onClick={handleBulkResolve}
            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            Bulk Resolve
          </button>
        </div>
      </div>

      {tab === 'analytics' && analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 rounded-lg"><AlertTriangle size={20} className="text-red-500" /></div>
                <div>
                  <p className="text-sm text-gray-500">Total Alerts</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-yellow-50 rounded-lg"><Shield size={20} className="text-yellow-500" /></div>
                <div>
                  <p className="text-sm text-gray-500">Pending Review</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.pending}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-50 rounded-lg"><CheckCircle size={20} className="text-green-500" /></div>
                <div>
                  <p className="text-sm text-gray-500">Resolved</p>
                  <p className="text-2xl font-bold text-gray-900">{resolved}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 rounded-lg"><TrendingUp size={20} className="text-blue-500" /></div>
                <div>
                  <p className="text-sm text-gray-500">Resolution Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.total > 0 ? Math.round((resolved / analytics.total) * 100) : 0}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp size={16} /> Alerts Per Day (Last 30 Days)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dayData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11 }} stroke="#94a3b8" padding={{ left: 12, right: 12 }} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} domain={[0, yMax]} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} labelFormatter={(v) => fmtDay(String(v))} />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Alerts" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PieIcon size={16} /> By Severity
              </h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={SEVERITY_CHART_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No data</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={16} /> Top 5 Courses by Fraud Alerts
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics.byCourse} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <YAxis dataKey="course_name" type="category" tick={{ fontSize: 11 }} width={150} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Alerts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'list' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex gap-2">
              <div className="relative">
                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                  <option value="false_positive">False Positive</option>
                </select>
              </div>
              <select
                value={severityFilter}
                onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Severity</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <span className="text-sm text-gray-500">{total} alerts</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" />
                Alerts
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No fraud alerts found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Student</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Session</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Reason</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Severity</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Date</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {alerts.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3.5 text-sm text-gray-900 font-medium font-mono">{a.studentId.slice(0, 8)}...</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 font-mono">{a.sessionId.slice(0, 8)}...</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[200px] truncate">{a.reason}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${severityColors[a.severity] || 'bg-gray-100 text-gray-600'}`}>
                              {a.severity}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || 'bg-gray-100 text-gray-600'}`}>
                              {a.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setSelectedAlert(a)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" title="View details">
                                <Eye size={16} />
                              </button>
                              {a.status === 'pending' && (
                                <>
                                  <button onClick={() => handleResolve(a.id, 'reviewed')} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="Mark as reviewed">
                                    <CheckCircle size={16} />
                                  </button>
                                  <button onClick={() => handleResolve(a.id, 'resolved')} className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50" title="Resolve">
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
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
        </>
      )}

      {selectedAlert && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setSelectedAlert(null)}>
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Alert Details</h2>
              <button onClick={() => setSelectedAlert(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Student ID</span>
                <span className="font-mono text-gray-900">{selectedAlert.studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Session ID</span>
                <span className="font-mono text-gray-900">{selectedAlert.sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Reason</span>
                <span className="text-gray-900 text-right max-w-[200px]">{selectedAlert.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Severity</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${severityColors[selectedAlert.severity]}`}>
                  {selectedAlert.severity}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[selectedAlert.status]}`}>
                  {selectedAlert.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-900">{new Date(selectedAlert.createdAt).toLocaleString()}</span>
              </div>
            </div>
            {selectedAlert.status === 'pending' && (
              <div className="flex gap-2 mt-5">
                <button onClick={() => handleResolve(selectedAlert.id, 'reviewed')} className="flex-1 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">
                  Mark Reviewed
                </button>
                <button onClick={() => handleResolve(selectedAlert.id, 'resolved')} className="flex-1 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100">
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
