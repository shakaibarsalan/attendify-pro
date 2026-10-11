import { useCallback, useEffect, useState } from 'react';
import { usersApi, authApi, institutionsApi, departmentsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Search, Users, Plus, X, ToggleLeft, ToggleRight, Pencil, Upload, Trash2 } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';
import RefreshButton from '@/components/shared/RefreshButton';
import { usePersistentForm } from '@/hooks/usePersistentForm';
import type { User } from '@/types';
import { toast } from 'sonner';
import ImportUsersModal from '@/components/users/ImportUsersModal';

const REGNO_RE = /^[FS][A-Z0-9]{10}$/i;  // exactly 11: F/S + 10

export default function StudentsPage() {
  const { user } = useAuthStore();
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [orgDomain, setOrgDomain] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  // Draft-persisted so a half-filled form survives leaving (e.g. to create a
  // department) and coming back; cleared on a successful create.
  const [createForm, setCreateForm, clearCreateDraft] = usePersistentForm('students-create', { fullName: '', registrationNumber: '', personalEmail: '', department: '' });
  const [createdInfo, setCreatedInfo] = useState<{ loginEmail: string; tempPassword?: string; emailSent: boolean; deliveryEmail?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editStudent, setEditStudent] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', registrationNumber: '', department: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const limit = 20;

  const loadDepartments = useCallback(() => {
    setDepsLoading(true);
    departmentsApi.list()
      .then((r: any) => setDepartments(r.data ?? []))
      .catch(() => {})
      .finally(() => setDepsLoading(false));
  }, []);

  useEffect(() => {
    if (user?.institutionId) {
      institutionsApi.get(user.institutionId).then((i: any) => setOrgDomain((i?.domain || '').toLowerCase())).catch(() => {});
    }
    loadDepartments();
  }, [user?.institutionId, loadDepartments]);

  const regNo = createForm.registrationNumber.trim();
  const previewEmail = regNo && orgDomain ? `${regNo.toLowerCase()}@${orgDomain}` : '';

  const fetchStudents = () => {
    setLoading(true);
    const params: any = { role: 'student', page, limit };
    if (search) params.search = search;
    usersApi.list(params)
      .then((res: any) => {
        const d = res.data ?? res;
        setStudents(Array.isArray(d) ? d : []);
        setTotal(res.total ?? d?.length ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStudents(); }, [search, page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!REGNO_RE.test(regNo)) {
      toast.error('Registration number must be 11 characters: F (Fall) or S (Spring) + 10, e.g. F2022123456');
      return;
    }
    if (!orgDomain) {
      toast.error("Your organization's email domain isn't configured. Ask a system admin to set it.");
      return;
    }
    if (!createForm.personalEmail.trim()) {
      toast.error('A personal email is required so the student receives their login details.');
      return;
    }
    setCreating(true);
    try {
      // No password is sent: the server generates a strong temporary one and
      // emails the login details to the personal email.
      const res = await authApi.register({
        fullName: createForm.fullName,
        registrationNumber: regNo,
        personalEmail: createForm.personalEmail,
        role: 'student',
        department: createForm.department || undefined,
      });
      const d = res?.data || {};
      setCreatedInfo({
        loginEmail: d.loginEmail || previewEmail,
        tempPassword: d.tempPassword,
        emailSent: !!d.emailSent,
        deliveryEmail: d.deliveryEmail || createForm.personalEmail,
      });
      setCreateForm({ fullName: '', registrationNumber: '', personalEmail: '', department: '' });
      clearCreateDraft();
      fetchStudents();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to create student';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (student: User) => {
    try {
      await usersApi.update(student.id, { isActive: !student.isActive });
      toast.success(`Student ${student.isActive ? 'deactivated' : 'activated'}`);
      fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update student status');
    }
  };

  const handleDelete = async (student: User) => {
    if (!confirm(`Permanently delete ${student.fullName}? This removes the student account and cannot be undone.`)) return;
    try {
      await usersApi.delete(student.id);
      toast.success('Student deleted');
      fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete student');
    }
  };

  const openEdit = (student: User) => {
    setEditStudent(student);
    setEditForm({ fullName: student.fullName, email: student.email || '', registrationNumber: (student as any).registrationNumber || '', department: student.department || '', phone: (student as any).phone || '' });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    setSaving(true);
    try {
      await usersApi.update(editStudent.id, editForm);
      toast.success('Student updated');
      setEditStudent(null);
      fetchStudents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 mt-1">Manage students in your institution</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload size={18} />
            Import CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={18} />
            Add Student
          </button>
        </div>
      </div>

      <ImportUsersModal open={showImport} defaultRole="student" onClose={() => setShowImport(false)} onDone={fetchStudents} />

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">{createdInfo ? 'Student created' : 'Create New Student'}</h2>
            <button onClick={() => { setShowCreate(false); setCreatedInfo(null); }} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          {createdInfo ? (
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <svg className="text-emerald-600" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              </div>
              <p className="text-sm text-gray-500">
                {createdInfo.emailSent
                  ? <>Login details were emailed to <span className="font-medium text-gray-700">{createdInfo.deliveryEmail}</span>.</>
                  : <>Email couldn't be sent automatically. Please share these credentials with the student.</>}
              </p>
              <div className="w-full mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-left space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Login email</div>
                  <div className="font-mono text-sm text-gray-800 break-all">{createdInfo.loginEmail}</div>
                </div>
                {createdInfo.tempPassword && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Temporary password</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="font-mono text-sm text-gray-800 bg-white border border-gray-200 rounded px-2 py-1">{createdInfo.tempPassword}</code>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(createdInfo.tempPassword!); toast.success('Password copied'); }} className="text-xs font-medium text-primary-600 hover:text-primary-700">Copy</button>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-amber-600 mt-3">The student will be asked to change this password on first login.</p>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => setCreatedInfo(null)} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Create another</button>
                <button type="button" onClick={() => { setCreatedInfo(null); setShowCreate(false); }} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">Done</button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input type="text" required value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Muhammad Ahmed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Registration Number *</label>
              <input type="text" required value={createForm.registrationNumber}
                onChange={(e) => setCreateForm({ ...createForm, registrationNumber: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent uppercase"
                placeholder="F2022123456" />
              <p className="text-xs mt-1 text-gray-500">
                {orgDomain
                  ? <>Login email: <span className="font-medium text-gray-700">{previewEmail || `f…@${orgDomain}`}</span></>
                  : <span className="text-amber-600">Org email domain not set — ask a system admin.</span>}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">11 characters · F (Fall) or S (Spring) + 10. Also used as the roll number.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Personal Email *</label>
              <input type="email" required value={createForm.personalEmail}
                onChange={(e) => setCreateForm({ ...createForm, personalEmail: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="personal@gmail.com" />
              <p className="text-[11px] text-gray-400 mt-0.5">A secure password is generated automatically and emailed here so the student can sign in.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Department</label>
                <RefreshButton onClick={loadDepartments} loading={depsLoading} title="Refresh departments" />
              </div>
              <select value={createForm.department}
                onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                <option value="">{departments.length ? 'Select a department…' : 'No departments yet'}</option>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Student'}
              </button>
            </div>
          </form>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search students by name, email, or roll number..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users size={20} />
            Students
          </h2>
          <span className="text-sm text-gray-500">{total} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No students found. Click "Add Student" to create one.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Roll #</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Department</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium text-gray-900">{s.fullName}</td>
                      <td className="px-5 py-4 text-gray-600 font-mono text-sm">{s.rollNumber || '—'}</td>
                      <td className="px-5 py-4 text-gray-600">{s.email}</td>
                      <td className="px-5 py-4 text-gray-600">{s.department || '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {s.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleToggleActive(s)} title={s.isActive !== false ? 'Deactivate' : 'Activate'} className={`p-1.5 rounded-lg transition-colors ${s.isActive !== false ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-red-400 hover:text-green-600 hover:bg-green-50'}`}>
                            {s.isActive !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          <button onClick={() => handleDelete(s)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={15} />
                          </button>
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
      {editStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditStudent(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Edit Student</h2>
              <button onClick={() => setEditStudent(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input type="text" required value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Registration Number <span className="text-xs font-normal text-gray-400">(= roll number)</span></label>
                <input type="text" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase" placeholder="F2022123456" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Email <span className="text-xs font-normal text-gray-400">(login ID)</span></label>
                <input type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
                <input type="text" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditStudent(null)} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
