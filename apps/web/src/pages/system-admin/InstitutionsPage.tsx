import { useEffect, useState } from 'react';
import { institutionsApi } from '@/lib/api';
import { Building2, Plus, X, Pencil, ToggleLeft, ToggleRight, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Institution } from '@/types';
import ConfirmDialog, { type ConfirmState } from '@/components/shared/ConfirmDialog';
import InstitutionDetailModal from '@/components/admin/InstitutionDetailModal';

interface NewInstitution {
  name: string;
  code: string;
  domain: string;
  city: string;
  contactEmail: string;
  adminEmail: string;
  adminName: string;
}

export default function InstitutionsPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editInst, setEditInst] = useState<Institution | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<NewInstitution>({ name: '', code: '', domain: '', city: '', contactEmail: '', adminEmail: '', adminName: '' });
  const [editForm, setEditForm] = useState({ name: '', domain: '', city: '', contactEmail: '', status: '' });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [detailInst, setDetailInst] = useState<Institution | null>(null);

  const fetchInstitutions = () => {
    institutionsApi.list()
      .then(({ data }) => { setInstitutions(data); setLoading(false); })
      .catch(() => { setLoading(false); toast.error('Failed to load institutions'); });
  };

  useEffect(() => { fetchInstitutions(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await institutionsApi.create(form);
      toast.success('Institution created successfully');
      setShowCreate(false);
      setForm({ name: '', code: '', domain: '', city: '', contactEmail: '', adminEmail: '', adminName: '' });
      fetchInstitutions();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create institution');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (inst: Institution) => {
    setEditInst(inst);
    setEditForm({ name: inst.name, domain: (inst as any).domain || '', city: (inst as any).city || '', contactEmail: (inst as any).contactEmail || '', status: inst.status });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInst) return;
    setSubmitting(true);
    try {
      await institutionsApi.update(editInst.id, editForm);
      toast.success('Institution updated');
      setEditInst(null);
      fetchInstitutions();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update institution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (inst: Institution) => {
    setConfirmState({
      title: `Delete "${inst.name}"?`,
      message: `This permanently removes the organization and its admin account. It is blocked if the org still has teachers, students, or courses — remove those first (open the org to see who's in it).`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await institutionsApi.delete(inst.id);
          toast.success('Institution deleted');
          fetchInstitutions();
        } catch (err: any) {
          toast.error(err?.response?.data?.error || 'Failed to delete institution');
        }
      },
    });
  };

  const handleToggleStatus = async (inst: Institution) => {
    const newStatus = inst.status === 'active' ? 'inactive' : 'active';
    try {
      await institutionsApi.update(inst.id, { status: newStatus });
      toast.success(`Institution ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchInstitutions();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleSetApiAccess = (inst: Institution, enabled: boolean) => {
    setConfirmState({
      title: `${enabled ? 'Enable' : 'Disable'} API access?`,
      message: `${enabled ? 'Enable' : 'Disable'} API access for "${inst.name}".${enabled ? '' : ' Existing API keys will stop working immediately.'}`,
      confirmLabel: enabled ? 'Enable' : 'Disable',
      tone: enabled ? 'primary' : 'danger',
      onConfirm: async () => {
        try {
          await institutionsApi.setApiAccess(inst.id, enabled);
          toast.success(`API access ${enabled ? 'enabled' : 'disabled'} for ${inst.name}`);
          fetchInstitutions();
        } catch (err: any) {
          toast.error(err?.response?.data?.error || `Failed to ${enabled ? 'enable' : 'disable'} API access`);
        }
      },
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700';
      case 'inactive': return 'bg-gray-100 text-gray-600';
      case 'suspended': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Institutions</h1>
        <p className="text-gray-500 mt-1">Manage all registered institutions — click an organization's name to view its teachers, students, and courses.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">All Institutions</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} />
            Add Institution
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading institutions...</div>
        ) : institutions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No institutions yet. Create the first one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Code</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">City</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">API Access</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {institutions.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50">
                          <Building2 size={16} className="text-blue-600" />
                        </div>
                        <button onClick={() => setDetailInst(inst)} title="View organization details" className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-left">{inst.name}</button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{inst.code}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{(inst as any).city || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(inst.status)}`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {(inst as any).apiAccessEnabled ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            <ShieldCheck size={12} /> Enabled
                          </span>
                          <button onClick={() => handleSetApiAccess(inst, false)} className="text-xs text-gray-400 hover:text-red-600 font-medium" title="Disable API access">Disable</button>
                        </div>
                      ) : (inst as any).apiAccessStatus === 'requested' ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Requested</span>
                          <button onClick={() => handleSetApiAccess(inst, true)} className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">Enable</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{(inst as any).apiAccessStatus === 'disabled' ? 'Disabled' : '—'}</span>
                          <button onClick={() => handleSetApiAccess(inst, true)} className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50">Enable</button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(inst)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(inst)}
                          className={`p-1.5 rounded-lg transition-colors ${inst.status === 'active' ? 'text-green-600 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
                          title={inst.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {inst.status === 'active' ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button
                          onClick={() => handleDelete(inst)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete organization"
                        >
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

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Add New Institution</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Institution Name</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Domain</label>
                <input type="text" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="umt.edu.pk" />
                <p className="text-xs text-gray-400 mt-1">Used to generate student/teacher login emails (e.g. f2022123456@umt.edu.pk). Must be unique.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input type="email" required value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                <input type="text" required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                <input type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Institution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit Institution</h2>
              <button onClick={() => setEditInst(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Institution Name</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Domain</label>
                <input type="text" value={editForm.domain} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="umt.edu.pk" />
                <p className="text-xs text-gray-400 mt-1">Drives login emails for this org. Must be unique across all organizations.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input type="email" value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditInst(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {detailInst && <InstitutionDetailModal institution={detailInst} onClose={() => setDetailInst(null)} />}
    </div>
  );
}
