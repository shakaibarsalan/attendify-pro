import { useEffect, useState } from 'react';
import api, { institutionsApi } from '@/lib/api';
import { Key, Plus, Trash2, X, Copy, AlertTriangle, Lock, Clock, Plug, ShieldCheck, BookOpen, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface IntegrationEndpoint { method: string; path: string; description: string }

interface ApiAccess {
  status: 'none' | 'requested' | 'enabled' | 'disabled';
  enabled: boolean;
  requestedAt: string | null;
  planId: string | null;
  planName: string | null;
  planAllowsApi: boolean;
  endpoints: IntegrationEndpoint[];
  usage?: { used: number; quota: number; remaining: number };
}

export default function ApiKeysPage() {
  const [access, setAccess] = useState<ApiAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [biometric, setBiometric] = useState(false);

  const [hooks, setHooks] = useState<any[]>([]);
  const [hookUrl, setHookUrl] = useState('');
  const [addingHook, setAddingHook] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const loadAccess = () => {
    setAccessLoading(true);
    institutionsApi.apiAccessStatus()
      .then((res: any) => setAccess(res))
      .catch(() => setAccess(null))
      .finally(() => setAccessLoading(false));
  };

  const loadKeys = () => {
    api.get('/api-keys')
      .then((res: any) => {
        const d = res.data ?? res;
        setKeys(Array.isArray(d) ? d : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadHooks = () => {
    api.get('/webhooks').then((res: any) => setHooks(res.data ?? res ?? [])).catch(() => {});
  };

  useEffect(() => { loadAccess(); }, []);
  useEffect(() => { if (access?.enabled) { loadKeys(); loadHooks(); } }, [access?.enabled]);

  const addHook = async () => {
    if (!/^https?:\/\/.+/.test(hookUrl.trim())) { toast.error('Enter a valid http(s) URL'); return; }
    setAddingHook(true);
    try {
      const res: any = await api.post('/webhooks', { url: hookUrl.trim(), events: ['attendance.marked'] });
      setNewSecret(res.secret || res.data?.secret);
      setHookUrl('');
      loadHooks();
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Failed to add webhook'); }
    finally { setAddingHook(false); }
  };
  const testHook = async (id: string) => {
    try { const res: any = await api.post(`/webhooks/${id}/test`); toast.success(res.message || 'Test event sent'); loadHooks(); }
    catch (err: any) { toast.error(err?.response?.data?.error || 'Test failed'); }
  };
  const deleteHook = async (id: string) => {
    if (!window.confirm('Delete this webhook?')) return;
    try { await api.delete(`/webhooks/${id}`); toast.success('Webhook deleted'); setHooks((h) => h.filter((x) => x.id !== id)); }
    catch { toast.error('Failed to delete'); }
  };

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await institutionsApi.requestApiAccess();
      toast.success('API access requested — an administrator will review it.');
      loadAccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to request API access');
    } finally {
      setRequesting(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Key name is required'); return; }
    setCreating(true);
    try {
      const res: any = await api.post('/api-keys', { name: name.trim(), permissions: biometric ? ['read', 'biometric'] : ['read'] });
      setNewKey(res.key || res.data?.key);
      setName('');
      setBiometric(false);
      setShowCreate(false);
      loadKeys();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string, keyName: string) => {
    if (!window.confirm(`Revoke API key "${keyName}"? Any integrations using it will stop working.`)) return;
    try {
      await api.delete(`/api-keys/${keyId}`);
      toast.success('API key revoked');
      setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, status: 'revoked' } : k));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to revoke key');
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const Header = (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">API &amp; Integrations</h1>
      <p className="text-gray-500 mt-1">Connect Attendify to your existing ERP or student/teacher portal.</p>
    </div>
  );

  if (accessLoading) {
    return <div className="space-y-6">{Header}<div className="p-8 text-center text-gray-500">Loading...</div></div>;
  }

  // ── Not enabled: show request / pending / upgrade states ──────────────────
  if (!access?.enabled) {
    const pending = access?.status === 'requested';
    const allowed = access?.planAllowsApi === true;
    return (
      <div className="space-y-6">
        {Header}
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary-50 rounded-xl shrink-0">
              <Plug size={24} className="text-primary-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">API access for integrations</h2>
              <p className="text-sm text-gray-600 mt-1">
                If your institution already runs its own ERP or student/teacher portal, API access lets you
                pull attendance, rosters, and session data from Attendify into your existing systems. Access
                must be enabled by an administrator before you can create API keys.
              </p>

              {pending ? (
                <div className="mt-5 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <Clock size={18} className="shrink-0" />
                  <span>
                    Your request is <strong>pending administrator approval</strong>
                    {access?.requestedAt ? ` (requested ${new Date(access.requestedAt).toLocaleDateString()})` : ''}.
                    You'll be notified once it is enabled.
                  </span>
                </div>
              ) : !allowed ? (
                <div className="mt-5">
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                    <Lock size={18} className="shrink-0 text-gray-400" />
                    <span>
                      API access is a paid-plan feature and is not available on the
                      <strong> {access?.planName || 'Free'} </strong> plan. Upgrade your plan from
                      <strong> Plan &amp; Billing </strong> to request it.
                    </span>
                  </div>
                  <button
                    disabled
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
                  >
                    <Lock size={16} /> Request API Access
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  <ShieldCheck size={16} />
                  {requesting ? 'Requesting...' : 'Request API Access'}
                </button>
              )}

              {access?.status === 'disabled' && !pending && (
                <p className="mt-3 text-xs text-gray-500">
                  API access was previously disabled for your organization. You may request it again above.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Enabled: integration docs + key management ────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {Header}
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Create Key
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm w-fit">
        <ShieldCheck size={16} /> API access is enabled for your organization.
      </div>

      {access?.usage && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Verification usage this month</h3>
            <span className="text-sm font-medium text-gray-700">{access.usage.used.toLocaleString()} / {access.usage.quota.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full ${access.usage.remaining === 0 ? 'bg-red-500' : 'bg-primary-600'}`}
              style={{ width: `${access.usage.quota > 0 ? Math.min(100, (access.usage.used / access.usage.quota) * 100) : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {access.usage.remaining.toLocaleString()} verifications remaining on the <strong>{access.planName}</strong> plan.
            Enroll, status and delete are free — only face/fingerprint <strong>verify</strong> &amp; <strong>identify</strong> count.
          </p>
        </div>
      )}

      {newKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">Save your API key now</h3>
              <p className="text-sm text-amber-700 mt-1">This key will only be shown once. Copy it now — you won't be able to see it again.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 break-all">{newKey}</code>
                <button onClick={() => copyText(newKey)} className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors shrink-0" title="Copy"><Copy size={16} /></button>
              </div>
              <button onClick={() => setNewKey(null)} className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium">I've saved the key — dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Integration guide */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900">How to connect your system</h3>
        <p className="text-sm text-gray-600 mt-1">
          Send your API key in the <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">X-API-Key</code> header on every request.
        </p>

        {/* Full interactive reference — request + response bodies for every endpoint */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <BookOpen size={22} className="text-indigo-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-indigo-900">Full API reference</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Every endpoint's <strong>request body, response schema, field types and examples</strong> — with live "Try it out". Hand this to your developers.
            </p>
          </div>
          <a
            href={`${baseUrl}/api/integration-docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Open reference <ExternalLink size={15} />
          </a>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-20">Base URL</span>
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">{baseUrl}</code>
          <button onClick={() => copyText(baseUrl)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors shrink-0" title="Copy"><Copy size={16} /></button>
        </div>

        <p className="text-xs font-medium text-gray-500 uppercase mt-5 mb-2">Available endpoints</p>
        <div className="space-y-2">
          {(access?.endpoints || []).map((ep) => (
            <div key={ep.path} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700 shrink-0">{ep.method}</span>
              <div className="min-w-0">
                <code className="text-xs font-mono text-gray-800 break-all">{ep.path}</code>
                <p className="text-xs text-gray-500 mt-0.5">{ep.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">Example — GET /api/public/attendance/session/&#123;sessionId&#125;</div>
          <pre className="p-3 text-xs font-mono text-gray-700 bg-white overflow-x-auto whitespace-pre">{`curl -H "X-API-Key: YOUR_KEY" \\
  ${baseUrl}/api/public/attendance/session/{sessionId}

// 200 response
[
  {
    "attendanceId": "att-001-uuid",
    "studentId": "student-001-uuid",
    "studentName": "Ahmed Khan",
    "rollNumber": "2021-CS-001",
    "status": "present",
    "markedAt": "2026-06-16T09:05:00Z",
    "method": "face",
    "confidence": 0.95
  }
]`}</pre>
        </div>
      </div>

      {/* Biometric API */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900">Biometric verification API</h3>
        <p className="text-sm text-gray-600 mt-1">
          Use Attendify's face &amp; fingerprint recognition in your own apps. Available on keys created with the
          <strong> biometric</strong> scope; subjects are referenced by your own ids (<code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">subjectRef</code>).
        </p>
        <div className="mt-3 space-y-2">
          {[
            { m: 'POST', p: '/api/public/biometric/face/enroll', d: 'Enroll a face for a subject.' },
            { m: 'POST', p: '/api/public/biometric/face/verify', d: '1:1 — verify an image against a subject.' },
            { m: 'POST', p: '/api/public/biometric/face/identify', d: '1:N — identify a face among your subjects.' },
            { m: 'POST', p: '/api/public/biometric/fingerprint/enroll', d: 'Enroll a contactless fingerprint.' },
            { m: 'POST', p: '/api/public/biometric/fingerprint/verify', d: '1:1 — verify a fingerprint against a subject.' },
          ].map((ep) => (
            <div key={ep.p} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-purple-100 text-purple-700 shrink-0">{ep.m}</span>
              <div className="min-w-0">
                <code className="text-xs font-mono text-gray-800 break-all">{ep.p}</code>
                <p className="text-xs text-gray-500 mt-0.5">{ep.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">Example — POST /api/public/biometric/face/verify</div>
          <pre className="p-3 text-xs font-mono text-gray-700 bg-white overflow-x-auto whitespace-pre">{`// request body
{
  "subjectRef": "employee-4821",
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}

// 200 response
{
  "match": true,
  "confidence": 0.97,
  "threshold": 0.55,
  "subjectRef": "employee-4821"
}`}</pre>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Verify &amp; identify count toward your monthly quota; enroll, status and delete are free. Anti-spoof is on by default (face).
          Full request &amp; response schemas for every endpoint are in the <a href={`${baseUrl}/api/integration-docs`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">API reference</a>.
        </p>
      </div>

      {/* Webhooks */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900">Webhooks</h3>
        <p className="text-sm text-gray-600 mt-1">
          Receive signed event callbacks (e.g. <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">attendance.marked</code>)
          at your endpoint instead of polling. Verify the <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">X-Attendify-Signature</code> header (HMAC-SHA256).
        </p>
        {newSecret && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800 font-medium">Signing secret (shown once — store it):</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-white border border-amber-200 rounded px-2 py-1 text-xs font-mono break-all">{newSecret}</code>
              <button onClick={() => copyText(newSecret)} className="p-1.5 bg-amber-100 rounded text-amber-800" title="Copy"><Copy size={14} /></button>
              <button onClick={() => setNewSecret(null)} className="text-xs text-amber-700 font-medium shrink-0">dismiss</button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://your-erp.edu/hooks/attendify"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button onClick={addHook} disabled={addingHook}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {addingHook ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <div className="min-w-0 flex-1">
                <code className="text-xs font-mono text-gray-800 break-all">{h.url}</code>
                <p className="text-xs text-gray-500 mt-0.5">{(h.events || []).join(', ')}{h.lastStatus ? ` · last delivery: ${h.lastStatus}` : ''}</p>
              </div>
              <button onClick={() => testHook(h.id)} className="text-xs font-medium text-primary-700 hover:underline shrink-0">Test</button>
              <button onClick={() => deleteHook(h.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0" title="Delete"><Trash2 size={14} /></button>
            </div>
          ))}
          {hooks.length === 0 && <p className="text-xs text-gray-400">No webhooks yet.</p>}
        </div>
      </div>

      {/* Key manager */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <Key size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No API keys yet. Create one to start integrating.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-3 grid grid-cols-12 text-xs font-medium text-gray-500 uppercase bg-gray-50 rounded-t-xl">
              <span className="col-span-3">Name</span>
              <span className="col-span-3">Key Prefix</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-2">Created</span>
              <span className="col-span-1">Last Used</span>
              <span className="col-span-1 text-right">Actions</span>
            </div>
            {keys.map((k) => (
              <div key={k.id} className="px-5 py-4 grid grid-cols-12 items-center hover:bg-gray-50">
                <div className="col-span-3"><p className="text-sm font-medium text-gray-900">{k.name}</p></div>
                <div className="col-span-3"><code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{k.keyPrefix}...</code></div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${k.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{k.status}</span>
                </div>
                <div className="col-span-2"><p className="text-xs text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</p></div>
                <div className="col-span-1"><p className="text-xs text-gray-400">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}</p></div>
                <div className="col-span-1 flex justify-end">
                  {k.status === 'active' && (
                    <button onClick={() => handleRevoke(k.id, k.name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Revoke"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Create API Key</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Key Name *</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. LMS Integration"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={biometric} onChange={(e) => setBiometric(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300" style={{ accentColor: '#4f46e5' }} />
                <span className="text-sm text-gray-700">
                  Enable <strong>biometric verification</strong> (face recognition API)
                  <span className="block text-xs text-gray-500">Lets this key call the face enroll / verify / identify endpoints.</span>
                </span>
              </label>
              <p className="text-xs text-gray-500">The full key will be shown only once after creation. Store it securely.</p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                  <Key size={16} />{creating ? 'Creating...' : 'Create Key'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
