import { useEffect, useState, useMemo } from 'react';
import { attendanceApi, reportsApi } from '@/lib/api';
import { BarChart3, TrendingUp, Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState('');

  useEffect(() => {
    Promise.all([
      reportsApi.myStats(),
      attendanceApi.list({ limit: 200 }),
    ]).then(([s, r]: any[]) => {
      setStats(Array.isArray(s) ? s : []);
      const d = r.data ?? r;
      setRecords(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredRecords = selectedCourse
    ? records.filter((r: any) => r.courseId === selectedCourse)
    : records;

  // Only the selected course's summary (or all of them for "All Courses"). Drives
  // both the headline cards and the per-course breakdown so a course selection
  // never leaks other courses' analytics.
  const visibleStats = selectedCourse
    ? stats.filter((s: any) => s.courseId === selectedCourse)
    : stats;

  // Headline totals come from the authoritative my-stats summary, which counts
  // every COMPLETED session for the course — not just the rows that happen to
  // exist in the attendance table — so "total/absent/%" stay correct even when
  // a class was missed (and so a single course filter can't read as 0/0/0%).
  const totalClasses = visibleStats.reduce((sum: number, s: any) => sum + (Number(s.totalSessions) || 0), 0);
  const presentCount = visibleStats.reduce((sum: number, s: any) => sum + (Number(s.attendedSessions) || 0), 0);
  const absentCount = Math.max(0, totalClasses - presentCount);
  const overallPct = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  const byMethod = filteredRecords.reduce((acc: any, r: any) => {
    const m = r.verificationMethod || 'unknown';
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  const trendData = useMemo(() => {
    const sorted = [...filteredRecords]
      .filter((r: any) => r.markedAt)
      .sort((a: any, b: any) => new Date(a.markedAt).getTime() - new Date(b.markedAt).getTime());

    let running = 0;
    return sorted.map((r: any, i: number) => {
      if (r.status === 'verified') running++;
      const cumPct = Math.round((running / (i + 1)) * 100);
      return {
        label: `#${r.lectureNumber ?? i + 1}`,
        attendance: cumPct,
        status: r.status,
      };
    });
  }, [filteredRecords]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading analytics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Analytics</h1>
          <p className="text-gray-500 mt-1">Detailed breakdown of your attendance records</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">All Courses</option>
          {stats.map((s: any) => (
            <option key={s.courseId} value={s.courseId}>{s.courseName} ({s.courseCode})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Classes</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalClasses}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600"><Calendar size={24} /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Present</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{presentCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-green-50 text-green-600"><CheckCircle2 size={24} /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Absent</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{absentCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 text-red-600"><XCircle size={24} /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Attendance Rate</p>
              <p className={`text-2xl font-bold mt-1 ${overallPct >= 80 ? 'text-green-600' : overallPct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{overallPct}%</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600"><TrendingUp size={24} /></div>
          </div>
        </div>
      </div>

      {trendData.length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp size={20} /> Attendance Trend Over Time
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: any) => [`${value}%`, 'Attendance']} />
              <Legend />
              <Line
                type="monotone"
                dataKey="attendance"
                name="Cumulative Attendance %"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2 text-center">Cumulative attendance percentage per lecture</p>
        </div>
      )}

      {visibleStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart3 size={20} /> {selectedCourse ? 'Course Breakdown' : 'Per-Course Breakdown'}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleStats.map((s: any) => {
              const pct = Math.round(parseFloat(s.attendancePercentage) || 0);
              return (
                <div key={s.courseId} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{s.courseName}</p>
                      <p className="text-sm text-gray-500">{s.courseCode} — {s.attendedSessions}/{s.totalSessions} classes attended</p>
                    </div>
                    <span className={`text-xl font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(byMethod).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Verification Methods</h2>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(byMethod).map(([method, count]) => (
              <div key={method} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{count as number}</p>
                <p className="text-sm text-gray-500 capitalize mt-1">{method.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Clock size={20} /> Recent Attendance</h2>
        </div>
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Course</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Lecture</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Method</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRecords.slice(0, 30).map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">{r.courseName || '—'}</p>
                      <p className="text-xs text-gray-500">{r.courseCode || ''}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">#{r.lectureNumber || '?'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{r.markedAt ? new Date(r.markedAt).toLocaleString() : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'verified' ? 'bg-green-50 text-green-700' :
                        r.status === 'absent' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 capitalize">{(r.verificationMethod || 'N/A').replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{r.confidenceScore ? `${Math.round(r.confidenceScore * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
