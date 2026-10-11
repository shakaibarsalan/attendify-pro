import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { Search, Users, Filter, Pencil, ToggleLeft, ToggleRight, X, Trash2 } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';
import type { User } from '@/types';
import { toast } from 'sonner';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', registrationNumber: '', department: '', phone: '', rollNumber: '' });
  const [saving, setSaving] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    const params: any = { page, limit };
    if (search) params.search = search;
    if (roleFilter) params.role = roleFilter;
    usersApi.list(params)
      .then((res: any) => {
        setUsers(res.data ?? []);
        setTotal(res.total ?? res.data?.length ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [search, roleFilter, page]);

  const handleToggleActive = async (u: User) => {
    try {
      await usersApi.update(u.id, { isActive: !u.isActive });
      toast.success(u.isActive ? 'User deactivated' : 'User activated');
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Permanently delete ${u.fullName} (${u.role.replace('_', ' ')})? This cannot be undone.`)) return;
    try {
      await usersApi.delete(u.id);
      toast.success('User deleted');
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete user');
    }
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({
      fullName: u.fullName || '',
      email: u.email || '',
      registrationNumber: (u as any).registrationNumber || '',
      department: (u as any).department || '',
      phone: (u as any).phone || '',
      rollNumber: (u as any).rollNumber || '',
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      await usersApi.update(editUser.id, {
        fullName: editForm.fullName || undefined,
        email: editForm.email || undefined,
        registrationNumber: editForm.registrationNumber || undefined,
        department: editForm.department || undefined,
        phone: editForm.phone || undefined,
        rollNumber: editForm.rollNumber || undefined,
      });
      toast.success('User updated');
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      student: 'bg-blue-50 text-blue-700',
      teacher: 'bg-purple-50 text-purple-700',
      org_admin: 'bg-orange-50 text-orange-700',
      system_admin: 'bg-red-50 text-red-700',
    };
    return map[role] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-gray-500 mt-1">Manage all users in your institution</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); }} className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </form>
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Roles</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="org_admin">Org Admin</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={20} /> All Users</h2>
          <span className="text-sm text-gray-500">{total} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No users found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Email</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Role</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Department</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900 text-sm">{u.fullName}</p>
                        {(u as any).rollNumber && <p className="text-xs text-gray-500">{(u as any).rollNumber}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadge(u.role)}`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{(u as any).department || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded-lg transition-colors ${u.isActive ? 'text-green-600 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
                            title={u.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {u.isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                          </button>
                          {(u.role === 'teacher' || u.role === 'student') && (
                            <button onClick={() => handleDelete(u)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                              <Trash2 size={15} />
                            </button>
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

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Edit User — {editUser.fullName}</h2>
              <button onClick={() => setEditUser(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {editUser.role !== 'org_admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number <span className="text-xs font-normal text-gray-400">(F/S…)</span></label>
                  <input type="text" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase" placeholder="F2022123456" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Email <span className="text-xs font-normal text-gray-400">(login ID)</span></label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input type="text" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {editUser.role === 'student' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                  <input type="text" value={editForm.rollNumber} onChange={(e) => setEditForm({ ...editForm, rollNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              {editUser.role !== 'student' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
