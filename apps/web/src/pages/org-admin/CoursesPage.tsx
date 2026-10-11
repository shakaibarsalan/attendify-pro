import { useEffect, useState } from 'react';
import { coursesApi, usersApi, departmentsApi } from '@/lib/api';
import { BookOpen, Plus, X } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';
import RefreshButton from '@/components/shared/RefreshButton';
import { toast } from 'sonner';

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const limit = 20;

  const [createForm, setCreateForm] = useState({
    name: '', code: '', description: '', teacherId: '', departmentId: '', semester: 'Fall 2026',
    section: '', credits: 3, maxStudents: 60,
  });

  const [editCourse, setEditCourse] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', code: '', description: '', teacherId: '', departmentId: '', semester: '',
    section: '', credits: 3, maxStudents: 60, isActive: true,
  });

  const fetchCourses = () => {
    setLoading(true);
    coursesApi.list({ page, limit })
      .then((res: any) => {
        const d = res.data ?? res;
        setCourses(Array.isArray(d) ? d : []);
        setTotal(res.total ?? d?.length ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchTeachers = () => {
    usersApi.list({ role: 'teacher', limit: 100 })
      .then((res: any) => {
        const d = res.data ?? res;
        setTeachers(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchCourses(); fetchTeachers(); }, [page]);
  useEffect(() => { departmentsApi.list().then((r: any) => setDepartments(r.data ?? [])).catch(() => {}); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await coursesApi.create({
        name: createForm.name,
        code: createForm.code,
        description: createForm.description || undefined,
        teacherId: createForm.teacherId || undefined,
        departmentId: createForm.departmentId || undefined,
        semester: createForm.semester,
        academicYear: createForm.semester.split(' ')[1] || '2026',
        section: createForm.section || undefined,
        credits: createForm.credits,
        maxStudents: createForm.maxStudents,
      });
      toast.success('Course created successfully');
      setShowCreate(false);
      setCreateForm({ name: '', code: '', description: '', teacherId: '', departmentId: '', semester: 'Fall 2026', section: '', credits: 3, maxStudents: 60 });
      fetchCourses();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (c: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditCourse(c);
    try {
      const res: any = await coursesApi.get(c.id);
      const d = res.data ?? res ?? c;
      setEditForm({
        name: d.name || '',
        code: d.code || '',
        description: d.description || '',
        teacherId: d.teacherId || d.teacher_id || '',
        departmentId: d.departmentId || d.department_id || '',
        semester: d.semester || '',
        section: d.section || '',
        credits: d.credits ?? 3,
        maxStudents: d.maxStudents ?? d.max_students ?? 60,
        isActive: (d.isActive ?? d.is_active) !== false,
      });
    } catch {
      setEditCourse(null);
      toast.error('Failed to load course details');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCourse) return;
    setSavingEdit(true);
    try {
      await coursesApi.update(editCourse.id, {
        name: editForm.name,
        code: editForm.code,
        description: editForm.description,
        teacherId: editForm.teacherId || undefined,
        departmentId: editForm.departmentId || undefined,
        semester: editForm.semester,
        academicYear: editForm.semester.split(' ')[1] || undefined,
        section: editForm.section,
        credits: editForm.credits,
        maxStudents: editForm.maxStudents,
        isActive: editForm.isActive,
      });
      toast.success('Course updated');
      setEditCourse(null);
      fetchCourses();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update course');
    } finally {
      setSavingEdit(false);
    }
  };

  const viewEnrollments = async (courseId: string) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      return;
    }
    try {
      const res: any = await coursesApi.enrollments(courseId);
      const d = res.data ?? res;
      setEnrolledStudents(Array.isArray(d) ? d : []);
      setExpandedCourse(courseId);
    } catch {
      toast.error('Failed to load enrollments');
    }
  };

  const getTeacherName = (teacherId: string) => {
    const t = teachers.find((t) => t.id === teacherId);
    return t ? t.fullName : 'Unassigned';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-gray-500 mt-1">Manage courses and assign teachers</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
          <Plus size={18} />
          Add Course
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Create New Course</h2>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Name *</label>
              <input type="text" required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Artificial Intelligence" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Code *</label>
              <input type="text" required value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="CS401" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assigned Teacher *</label>
              <select required value={createForm.teacherId} onChange={(e) => setCreateForm({ ...createForm, teacherId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                <option value="">Select a teacher...</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName} — {t.department || 'No dept'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
              <select value={createForm.departmentId} onChange={(e) => setCreateForm({ ...createForm, departmentId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                <option value="">{departments.length ? 'Select a department…' : 'No departments yet'}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Semester</label>
              <input type="text" value={createForm.semester} onChange={(e) => setCreateForm({ ...createForm, semester: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Section</label>
              <input type="text" value={createForm.section} onChange={(e) => setCreateForm({ ...createForm, section: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="A" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Credits</label>
              <input type="number" value={createForm.credits} onChange={(e) => setCreateForm({ ...createForm, credits: parseInt(e.target.value) || 3 })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" rows={2} placeholder="Course description..." />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={creating} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BookOpen size={20} /> Courses</h2>
          <span className="text-sm text-gray-500">{total} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No courses yet. Create one to get started.</div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {courses.map((c) => (
                <div key={c.id}>
                  <div className="px-5 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => viewEnrollments(c.id)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-gray-500">{c.code}</span>
                          <span className="text-sm text-gray-400">|</span>
                          <span className="text-sm text-gray-500">Teacher: {c.teacherId ? getTeacherName(c.teacherId) : 'Unassigned'}</span>
                          <span className="text-sm text-gray-400">|</span>
                          <span className="text-sm text-gray-500">{c.semester || ''} {c.section || ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={(e) => openEdit(c, e)} className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50">Edit</button>
                        <span className="text-xs text-gray-400">{expandedCourse === c.id ? 'Hide' : 'View'} enrolled</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {c.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expandedCourse === c.id && (
                    <div className="px-5 pb-4 bg-gray-50">
                      <p className="text-sm font-medium text-gray-700 mb-2">Enrolled Students ({enrolledStudents.length})</p>
                      {enrolledStudents.length === 0 ? (
                        <p className="text-sm text-gray-400">No students enrolled yet. Use the Enrollments page to add students.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {enrolledStudents.map((s) => (
                            <div key={s.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                              <p className="text-sm font-medium text-gray-900">{s.fullName}</p>
                              <p className="text-xs text-gray-500">{s.rollNumber || s.email}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {total > limit && (
              <div className="px-5 border-t border-gray-200">
                <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {editCourse && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditCourse(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Edit Course</h2>
              <button onClick={() => setEditCourse(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Name *</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Code *</label>
                <input type="text" required value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Assigned Teacher *</label>
                  <RefreshButton onClick={fetchTeachers} title="Refresh teachers" />
                </div>
                <select required value={editForm.teacherId} onChange={(e) => setEditForm({ ...editForm, teacherId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">Select a teacher...</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName} — {t.department || 'No dept'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
                <select value={editForm.departmentId} onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">{departments.length ? 'Select a department…' : 'No departments yet'}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Semester</label>
                <input type="text" value={editForm.semester} onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Section</label>
                <input type="text" value={editForm.section} onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Credits</label>
                <input type="number" value={editForm.credits} onChange={(e) => setEditForm({ ...editForm, credits: parseInt(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Students</label>
                <input type="number" value={editForm.maxStudents} onChange={(e) => setEditForm({ ...editForm, maxStudents: parseInt(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" rows={2} />
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600" />
                  Active (uncheck to archive this course)
                </label>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditCourse(null)} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingEdit} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
