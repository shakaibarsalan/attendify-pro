import { useEffect, useMemo, useState } from 'react';
import { orgRequestsApi } from '@/lib/api';
import { Inbox, CheckCircle, XCircle, X, Building2, CalendarClock, Rocket } from 'lucide-react';
import { toast } from 'sonner';

interface OrgRequest {
  id: string;
  organizationName: string;
  organizationCode?: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  expectedStudents?: number;
  message?: string;
  requestType?: 'demo' | 'signup';
  institutionDomain?: string;
  contactedAt?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function OrgRequestsPage() {
  const [requests, setRequests] = useState<OrgRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveModal, setApproveModal] = useState<OrgRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<OrgRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approveForm, setApproveForm] = useState({
    institutionName: '',
    institutionCode: '',
    domain: '',
    adminName: '',
    personalEmail: '',
  });

  // The org-admin's official LOGIN email is generated from the institution domain:
  // domain "uot.edu.pk" -> admin@uot.edu.pk (mirrors the server).
  const generatedLoginEmail = (() => {
    const d = approveForm.domain.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/+$/, '');
    return `admin@${d || 'organization.com'}`;
  })();
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'demo' | 'signup'>('all');
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  const fetchRequests = () => {
    orgRequestsApi.list()
      .then((res: any) => {
        const body = res.data;
        const list = Array.isArray(body) ? body : (body?.data ?? []);
        setRequests(list);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        toast.error('Failed to load organization requests');
      });
  };

  useEffect(() => { fetchRequests(); }, []);

  const openApprove = (req: OrgRequest) => {
    setApproveForm({
      institutionName: req.organizationName,
      institutionCode: req.organizationCode || '',
      domain: req.institutionDomain || '',
      adminName: req.contactName,
      personalEmail: req.contactEmail,
    });
    setApproveModal(req);
  };

  const openReject = (req: OrgRequest) => {
    setRejectNotes('');
    setRejectModal(req);
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveModal) return;
    setSubmitting(true);
    try {
      const res: any = await orgRequestsApi.approve(approveModal.id, approveForm);
      toast.success('Request approved successfully');
      setApproveModal(null);
      // Surface the generated admin credentials (email delivery isn't guaranteed).
      if (res?.tempPassword) setCredentials({ email: res.adminEmail || generatedLoginEmail, password: res.tempPassword });
      fetchRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal) return;
    setSubmitting(true);
    try {
      await orgRequestsApi.reject(rejectModal.id, { adminNotes: rejectNotes });
      toast.success('Request rejected');
      setRejectModal(null);
      fetchRequests();
    } catch {
      toast.error('Failed to reject request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleDemo = async (req: OrgRequest) => {
    setSchedulingId(req.id);
    try {
      await orgRequestsApi.scheduleDemo(req.id);
      toast.success(`Booking invite emailed to ${req.contactEmail}`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send booking invite');
    } finally {
      setSchedulingId(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-50 text-yellow-700';
      case 'approved': return 'bg-green-50 text-green-700';
      case 'rejected': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const visible = useMemo(
    () => requests.filter((r) => typeFilter === 'all' || (r.requestType || 'demo') === typeFilter),
    [requests, typeFilter],
  );
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const demoCount = requests.filter((r) => (r.requestType || 'demo') === 'demo').length;
  const signupCount = requests.filter((r) => r.requestType === 'signup').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Requests</h1>
        <p className="text-gray-500 mt-1">Demo requests and direct sign-ups from the landing page</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {([
              { key: 'all', label: `All (${requests.length})` },
              { key: 'demo', label: `Demo (${demoCount})` },
              { key: 'signup', label: `Sign-up (${signupCount})` },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  typeFilter === t.key ? 'bg-primary-50 text-primary-700 border-primary-200 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 text-sm font-medium rounded-full">
              <Inbox size={14} />
              {pendingCount} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading requests...</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No {typeFilter === 'all' ? '' : typeFilter} organization requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Organization</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Contact</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Expected Students</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50">
                          <Building2 size={16} className="text-blue-600" />
                        </div>
                        <span className="font-medium text-gray-900">{req.organizationName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {req.requestType === 'signup' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                          <Rocket size={12} /> Sign-up
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          <CalendarClock size={12} /> Demo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm text-gray-900">{req.contactName}</div>
                      <div className="text-xs text-gray-500">{req.contactEmail}</div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{req.expectedStudents || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-4">
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {req.requestType !== 'signup' && (
                            <button
                              onClick={() => handleScheduleDemo(req)}
                              disabled={schedulingId === req.id}
                              title={req.contactedAt ? `Invite already sent ${new Date(req.contactedAt).toLocaleDateString()}` : 'Email a Calendly booking link so they can pick a time'}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                              <CalendarClock size={14} />
                              {schedulingId === req.id ? 'Sending…' : req.contactedAt ? 'Resend Invite' : 'Send Booking Invite'}
                            </button>
                          )}
                          <button
                            onClick={() => openApprove(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100 transition-colors"
                            title="Create the institution + admin account"
                          >
                            <CheckCircle size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => openReject(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      )}
                      {req.status === 'pending' && req.contactedAt && (
                        <p className="text-[11px] text-blue-500 mt-1">Booking invite sent</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Approve Request</h2>
              <button onClick={() => setApproveModal(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleApprove} className="p-5 space-y-4">
              <p className="text-sm text-gray-500">
                Approving <strong>{approveModal.organizationName}</strong>. Edit details below before confirming.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Institution Name</label>
                <input
                  type="text"
                  required
                  value={approveForm.institutionName}
                  onChange={(e) => setApproveForm({ ...approveForm, institutionName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Institution Code</label>
                <input
                  type="text"
                  required
                  value={approveForm.institutionCode}
                  onChange={(e) => setApproveForm({ ...approveForm, institutionCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g. LUMS, NUST"
                />
                <p className="text-[11px] text-gray-400 mt-1">Set by the institution during sign-up. Edit only if needed.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Domain</label>
                <input
                  type="text"
                  value={approveForm.domain}
                  onChange={(e) => setApproveForm({ ...approveForm, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="uet.edu.pk"
                />
                <p className="text-[11px] text-gray-400 mt-1">Set by the institution. Used to generate admin/teacher/student login emails.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                <input
                  type="text"
                  required
                  value={approveForm.adminName}
                  onChange={(e) => setApproveForm({ ...approveForm, adminName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin's Personal Email</label>
                <input
                  type="email"
                  required
                  value={approveForm.personalEmail}
                  onChange={(e) => setApproveForm({ ...approveForm, personalEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="jane@gmail.com"
                />
                <p className="text-[11px] text-gray-400 mt-1">The login email + temporary password are sent here. This is their real inbox, not the login email.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Generated Login Email</label>
                <div className="w-full px-3 py-2 border border-dashed border-gray-300 bg-gray-50 rounded-lg text-sm font-mono text-gray-800 break-all">
                  {generatedLoginEmail}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Auto-generated from the institution domain. The org admin logs in with this — not their personal email.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setApproveModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Approving...' : 'Confirm Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><CheckCircle size={18} className="text-green-600" /> Admin account created</h2>
              <button onClick={() => setCredentials(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                The official login email and a temporary password were emailed to the admin's personal inbox. Share these credentials in case the email doesn't arrive — they'll log in with the official email below and can change the password on first login.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                <div><span className="text-gray-500">Login email:</span> <span className="font-medium text-gray-900 break-all">{credentials.email}</span></div>
                <div className="flex items-center justify-between gap-2">
                  <div><span className="text-gray-500">Temporary password:</span> <code className="font-mono font-semibold text-gray-900">{credentials.password}</code></div>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`); toast.success('Copied'); }}
                    className="px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 shrink-0"
                  >Copy</button>
                </div>
              </div>
              <p className="text-[11px] text-amber-600">This password is shown only once. Copy it now.</p>
              <div className="flex justify-end">
                <button onClick={() => setCredentials(null)} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Reject Request</h2>
              <button onClick={() => setRejectModal(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleReject} className="p-5 space-y-4">
              <p className="text-sm text-gray-500">
                Rejecting request from <strong>{rejectModal.organizationName}</strong>.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  rows={3}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Reason for rejection..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
