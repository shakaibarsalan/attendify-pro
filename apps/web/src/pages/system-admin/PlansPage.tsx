import { useEffect, useMemo, useState } from 'react';
import { plansApi, institutionsApi } from '@/lib/api';
import { CreditCard, Pencil, X, Building2, Users, GraduationCap, Layers, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string; name: string; description?: string;
  maxStudents: number; maxTeachers: number; maxDepartments: number; maxVerifications?: number;
  priceMonthly: string | number; priceYearly: string | number;
  features: string[]; isActive?: boolean; sortOrder?: number;
}
interface Org {
  id: string; name: string; code: string; status: string;
  planId?: string | null; planName?: string | null; planStatus?: string | null;
  maxStudents?: number; maxTeachers?: number; maxDepartments?: number; maxVerifications?: number;
}

const num = (v: any) => (v === '' || v === null || v === undefined ? 0 : Number(v));

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState<string>('all');

  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<any>({});
  const [limitsOrg, setLimitsOrg] = useState<Org | null>(null);
  const [limitsForm, setLimitsForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const fetchPlans = () => plansApi.list().then((r: any) => setPlans(r.data ?? [])).catch(() => {});
  const fetchOrgs = () => institutionsApi.list().then(({ data }: any) => setOrgs(data ?? [])).catch(() => {});

  useEffect(() => { Promise.all([fetchPlans(), fetchOrgs()]).finally(() => setLoading(false)); }, []);

  const openPlanEdit = (p: Plan) => {
    setPlanForm({
      name: p.name, description: p.description || '',
      priceMonthly: num(p.priceMonthly), priceYearly: num(p.priceYearly),
      maxStudents: p.maxStudents, maxTeachers: p.maxTeachers, maxDepartments: p.maxDepartments,
      maxVerifications: p.maxVerifications ?? 0,
      features: (p.features || []).join('\n'),
    });
    setEditPlan(p);
  };

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPlan) return;
    setSaving(true);
    try {
      await plansApi.update(editPlan.id, {
        name: planForm.name,
        description: planForm.description,
        priceMonthly: num(planForm.priceMonthly),
        priceYearly: num(planForm.priceYearly),
        maxStudents: num(planForm.maxStudents),
        maxTeachers: num(planForm.maxTeachers),
        maxDepartments: num(planForm.maxDepartments),
        maxVerifications: num(planForm.maxVerifications),
        features: String(planForm.features).split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast.success('Plan updated');
      setEditPlan(null);
      fetchPlans();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update plan');
    } finally { setSaving(false); }
  };

  const assignPlan = async (org: Org, planId: string) => {
    if (!planId) return;
    try {
      await institutionsApi.assignPlan(org.id, { planId, planStatus: 'active' });
      toast.success(`Plan assigned to ${org.name}`);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to assign plan');
    }
  };

  const openLimits = (org: Org) => {
    setLimitsForm({ maxStudents: org.maxStudents ?? 0, maxTeachers: org.maxTeachers ?? 0, maxDepartments: org.maxDepartments ?? 0, maxVerifications: org.maxVerifications ?? 0 });
    setLimitsOrg(org);
  };
  const saveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limitsOrg) return;
    setSaving(true);
    try {
      await institutionsApi.update(limitsOrg.id, {
        maxStudents: num(limitsForm.maxStudents),
        maxTeachers: num(limitsForm.maxTeachers),
        maxDepartments: num(limitsForm.maxDepartments),
        maxVerifications: num(limitsForm.maxVerifications),
      });
      toast.success('Limits updated');
      setLimitsOrg(null);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update limits');
    } finally { setSaving(false); }
  };

  const filteredOrgs = useMemo(() => {
    if (planFilter === 'all') return orgs;
    if (planFilter === 'none') return orgs.filter((o) => !o.planId);
    return orgs.filter((o) => o.planId === planFilter);
  }, [orgs, planFilter]);

  const fmt = (n?: number) => (n === undefined || n === null ? '—' : n >= 999999 ? '∞' : n.toLocaleString());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plans & Subscriptions</h1>
        <p className="text-gray-500 mt-1">Edit plan tiers, assign plans to organizations, and set per-org limits</p>
      </div>

      {/* Plan templates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full p-8 text-center text-gray-500">Loading…</div>
        ) : plans.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="text-xs text-gray-400">{p.description}</p>
              </div>
              <button onClick={() => openPlanEdit(p)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Edit plan"><Pencil size={15} /></button>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">${num(p.priceMonthly)}</span>
              <span className="text-sm text-gray-400">/mo</span>
              <span className="text-xs text-gray-400 ml-2">${num(p.priceYearly)}/yr</span>
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-gray-600">
              <p className="flex items-center gap-1.5"><Users size={14} className="text-gray-400" /> {fmt(p.maxStudents)} students</p>
              <p className="flex items-center gap-1.5"><GraduationCap size={14} className="text-gray-400" /> {fmt(p.maxTeachers)} teachers</p>
              <p className="flex items-center gap-1.5"><Layers size={14} className="text-gray-400" /> {fmt(p.maxDepartments)} departments</p>
            </div>
            <ul className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs text-gray-500">
              {(p.features || []).slice(0, 5).map((f) => (
                <li key={f} className="flex items-start gap-1.5"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> <span>{f}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Organizations & their plans */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={20} /> Organizations</h2>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="all">All plans ({orgs.length})</option>
            <option value="none">No plan / Trial ({orgs.filter((o) => !o.planId).length})</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({orgs.filter((o) => o.planId === p.id).length})</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Organization</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Plan</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Limits (students / teachers / depts)</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Assign / Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrgs.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{o.name}</p>
                    <p className="text-xs text-gray-400">{o.code}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {o.planId ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        <CreditCard size={12} /> {o.planName || o.planId}
                        <span className="text-primary-400">· {o.planStatus || 'active'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">Trial / none</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{fmt(o.maxStudents)} / {fmt(o.maxTeachers)} / {fmt(o.maxDepartments)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <select value="" onChange={(e) => assignPlan(o, e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">Assign plan…</option>
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button onClick={() => openLimits(o)} className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Edit limits</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrgs.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No organizations for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan edit modal */}
      {editPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditPlan(null)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit plan — {editPlan.name}</h2>
              <button onClick={() => setEditPlan(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={savePlan} className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Price / month ($)</label>
                  <input type="number" min={0} step="1" value={planForm.priceMonthly} onChange={(e) => setPlanForm({ ...planForm, priceMonthly: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Price / year ($)</label>
                  <input type="number" min={0} step="1" value={planForm.priceYearly} onChange={(e) => setPlanForm({ ...planForm, priceYearly: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Max students</label>
                  <input type="number" min={0} value={planForm.maxStudents} onChange={(e) => setPlanForm({ ...planForm, maxStudents: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Max teachers</label>
                  <input type="number" min={0} value={planForm.maxTeachers} onChange={(e) => setPlanForm({ ...planForm, maxTeachers: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Max departments</label>
                  <input type="number" min={0} value={planForm.maxDepartments} onChange={(e) => setPlanForm({ ...planForm, maxDepartments: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Verifications / month (Biometric API)</label>
                  <input type="number" min={0} value={planForm.maxVerifications ?? 0} onChange={(e) => setPlanForm({ ...planForm, maxVerifications: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Features (one per line)</label>
                <textarea rows={6} value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
              </div>
              <p className="text-[11px] text-gray-400">Editing a plan does not change orgs already on it — re-assign the plan to apply new limits.</p>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setEditPlan(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save plan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-org limits modal */}
      {limitsOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLimitsOrg(null)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Limits — {limitsOrg.name}</h2>
              <button onClick={() => setLimitsOrg(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={saveLimits} className="p-5 space-y-3">
              <p className="text-xs text-gray-400">Override this organization's limits independently of its plan.</p>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max students</label>
                <input type="number" min={0} value={limitsForm.maxStudents} onChange={(e) => setLimitsForm({ ...limitsForm, maxStudents: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max teachers</label>
                <input type="number" min={0} value={limitsForm.maxTeachers} onChange={(e) => setLimitsForm({ ...limitsForm, maxTeachers: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max departments</label>
                <input type="number" min={0} value={limitsForm.maxDepartments} onChange={(e) => setLimitsForm({ ...limitsForm, maxDepartments: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Verifications / month (Biometric API)</label>
                <input type="number" min={0} value={limitsForm.maxVerifications ?? 0} onChange={(e) => setLimitsForm({ ...limitsForm, maxVerifications: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setLimitsOrg(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save limits'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
