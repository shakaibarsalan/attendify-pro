import { useEffect, useState } from 'react';
import { usersApi, institutionsApi } from '@/lib/api';
import { Shield, Search, ToggleLeft, ToggleRight, Trash2, Building2 } from 'lucide-react';
import type { User } from '@/types';
import { toast } from 'sonner';

export default function OrgAdminsPage() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [instMap, setInstMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAdmins = () => {
    setLoading(true);
    usersApi.list({ role: 'org_admin', limit: 200 })
      .then((res: any) => { setAdmins(res.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAdmins();
    institutionsApi.list()
      .then(({ data }: any) => {
        const m: Record<string, string> = {};
        (data ?? []).forEach((i: any) => { m[i.id] = i.name; });
        setInstMap(m);
      })
      .catch(() => {});
  }, []);

  const toggleActive = async (a: User) => {
    try {
      await usersApi.update(a.id, { isActive: !a.isActive });
      toast.success(a.isActive ? 'Org admin deactivated' : 'Org admin activated');
      fetchAdmins();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const remove = async (a: User) => {
    if (!confirm(`Permanently delete org admin ${a.fullName} (${a.email})? Their organization will be left without this admin. This cannot be undone.`)) return;
    try {
      await usersApi.delete(a.id);
      toast.success('Org admin deleted');
      fetchAdmins();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete org admin');
    }
  };

  const filtered = admins.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (a.fullName || '').toLowerCase().includes(q)
      || (a.email || '').toLowerCase().includes(q)
      || (instMap[a.institutionId || ''] || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Admins</h1>
        <p className="text-gray-500 mt-1">Activate, deactivate, or remove organization administrator accounts</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or organization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Shield size={20} /> Org Admins</h2>
          <span className="text-sm text-gray-500">{filtered.length} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No organization admins found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Organization</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{a.fullName}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 break-all">{a.email}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 size={14} className="text-gray-400" />
                        {instMap[a.institutionId || ''] || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${a.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleActive(a)}
                          className={`p-1.5 rounded-lg transition-colors ${a.isActive ? 'text-green-600 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
                          title={a.isActive ? 'Deactivate' : 'Activate'}>
                          {a.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => remove(a)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
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
