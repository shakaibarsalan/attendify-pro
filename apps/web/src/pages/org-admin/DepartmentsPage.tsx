import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Building2, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/departments')
      .then((res: any) => {
        const d = res.data ?? res;
        setDepartments(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({ name: dept.name, code: dept.code, description: dept.description || '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and code are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/departments/${editing.id}`, form);
        toast.success('Department updated');
      } else {
        await api.post('/departments', form);
        toast.success('Department created');
      }
      closeModal();
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: Department) => {
    if (!window.confirm(`Delete department "${dept.name}"? Users assigned to it will have their department cleared.`)) return;
    try {
      await api.delete(`/departments/${dept.id}`);
      toast.success('Department deleted');
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete department');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 mt-1">Manage academic departments in your institution</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          Add Department
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No departments yet. Add your first department.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-3 grid grid-cols-12 text-xs font-medium text-gray-500 uppercase bg-gray-50 rounded-t-xl">
              <span className="col-span-3">Code</span>
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Description</span>
              <span className="col-span-1 text-right">Actions</span>
            </div>
            {departments.map((dept) => (
              <div key={dept.id} className="px-5 py-4 grid grid-cols-12 items-center hover:bg-gray-50">
                <div className="col-span-3">
                  <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-xs font-mono font-medium rounded">
                    {dept.code}
                  </span>
                </div>
                <div className="col-span-5">
                  <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-sm text-gray-500 truncate">{dept.description || '—'}</p>
                </div>
                <div className="col-span-1 flex items-center justify-end gap-1">
                  <button
                    onClick={() => openEdit(dept)}
                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(dept)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing ? 'Edit Department' : 'Add Department'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Department Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Computer Science"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. CS"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  <Check size={16} />
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
