import { useEffect, useState } from 'react';
import { institutionsApi } from '@/lib/api';
import { X, Building2 } from 'lucide-react';

interface Person { id: string; fullName: string; email: string; department?: string; rollNumber?: string; isActive: boolean; }
interface Course { id: string; name: string; code: string; semester?: string; teacherName?: string | null; isActive: boolean; }

type Tab = 'teachers' | 'students' | 'courses' | 'admins';

/**
 * System-admin "monitor" view for one organization: live counts plus the
 * teacher / student / course lists, loaded from /institutions/:id/overview.
 */
export default function InstitutionDetailModal({ institution, onClose }: { institution: any; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<any>({});
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [students, setStudents] = useState<Person[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [admins, setAdmins] = useState<Person[]>([]);
  const [tab, setTab] = useState<Tab>('teachers');

  useEffect(() => {
    let alive = true;
    // The axios interceptor already unwraps response.data, so `r` IS the
    // payload ({ counts, teachers, ... }) — do not read r.data here.
    institutionsApi.overview(institution.id)
      .then((r: any) => {
        if (!alive) return;
        const d = r || {};
        setCounts(d.counts || {});
        setTeachers(d.teachers || []);
        setStudents(d.students || []);
        setCourses(d.courses || []);
        setAdmins(d.admins || []);
      })
      .catch(() => { if (alive) setError('Could not load this organization. Please try again.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [institution.id]);

  const statCards = [
    { label: 'Students', value: counts.students ?? '—' },
    { label: 'Teachers', value: counts.teachers ?? '—' },
    { label: 'Courses', value: counts.courses ?? '—' },
    { label: 'Total users', value: counts.totalUsers ?? '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 shrink-0"><Building2 size={18} className="text-blue-600" /></div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 truncate">{institution.name}</h2>
              <p className="text-xs text-gray-500 truncate">
                {institution.code}{(institution as any).domain ? ` · ${(institution as any).domain}` : ''} · {institution.status}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
          {statCards.map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 flex items-center gap-1 border-b border-gray-200">
          {([['teachers', 'Teachers'], ['students', 'Students'], ['courses', 'Courses'], ['admins', 'Admins']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[180px]">
          {loading ? (
            <div className="text-center text-gray-500 py-10">Loading…</div>
          ) : error ? (
            <div className="text-center text-red-500 py-10 text-sm">{error}</div>
          ) : tab === 'teachers' ? (
            teachers.length === 0 ? <Empty label="teachers" /> :
              teachers.map((t) => <Row key={t.id} title={t.fullName} sub={t.email} meta={t.department} active={t.isActive} />)
          ) : tab === 'students' ? (
            students.length === 0 ? <Empty label="students" /> :
              students.map((s) => <Row key={s.id} title={s.fullName} sub={s.email} meta={s.rollNumber} active={s.isActive} />)
          ) : tab === 'courses' ? (
            courses.length === 0 ? <Empty label="courses" /> :
              courses.map((c) => <Row key={c.id} title={c.name} sub={c.code} meta={c.teacherName ? `Teacher: ${c.teacherName}` : 'Unassigned'} active={c.isActive} />)
          ) : (
            admins.length === 0 ? <Empty label="admins" /> :
              admins.map((a) => <Row key={a.id} title={a.fullName} sub={a.email} meta="Org admin" active={a.isActive} />)
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ title, sub, meta, active }: { title: string; sub?: string; meta?: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">{sub}{meta ? ` · ${meta}` : ''}</p>
      </div>
      {active === false && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0 ml-2">Inactive</span>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-center text-gray-400 py-10 text-sm">No {label} in this organization yet.</div>;
}
