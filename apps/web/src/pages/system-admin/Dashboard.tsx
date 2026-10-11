import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { institutionsApi, reportsApi } from '@/lib/api';
import { Building2, Users, BookOpen, Shield, ChevronRight } from 'lucide-react';
import type { Institution } from '@/types';

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([institutionsApi.list(), reportsApi.stats()])
      .then(([inst, s]) => { setInstitutions(inst.data); setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Institutions', value: stats?.totalInstitutions ?? institutions.length, icon: <Building2 size={24} />, color: 'bg-blue-50 text-blue-600', to: '/system-admin/institutions' },
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: <Users size={24} />, color: 'bg-green-50 text-green-600', to: '/system-admin/institutions' },
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, icon: <Shield size={24} />, color: 'bg-purple-50 text-purple-600', to: '/system-admin/activity' },
    { label: 'Pending Fraud', value: stats?.pendingFraudAlerts ?? 0, icon: <BookOpen size={24} />, color: 'bg-orange-50 text-orange-600', to: '/system-admin/activity' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Dashboard</h1>
        <p className="text-gray-500 mt-1">Platform overview and institution management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((stat) => (
          <div key={stat.label} onClick={() => navigate(stat.to)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(stat.to); } }}
            className="stat-card cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform`}>{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Institutions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click an institution to manage it</p>
          </div>
          <button onClick={() => navigate('/system-admin/institutions')} className="text-sm font-medium text-primary-600 hover:text-primary-700">View all</button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading institutions...</div>
        ) : institutions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No institutions yet. Create the first one to get started.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {institutions.map((inst) => (
              <div key={inst.id}
                onClick={() => navigate('/system-admin/institutions')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/system-admin/institutions'); } }}
                role="button" tabIndex={0}
                aria-label={`Manage ${inst.name}`}
                className="group px-5 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer focus:outline-none focus:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">{inst.name}</p>
                  <p className="text-sm text-gray-500">{inst.code} - {inst.city || 'No location'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${inst.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {inst.status}
                  </span>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
