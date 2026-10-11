import { useMemo, useRef, useState } from 'react';
import { X, Upload, Download, FileText, CheckCircle2, AlertCircle, Info, Loader2, ChevronDown } from 'lucide-react';
import { authApi } from '@/lib/api';
import { toast } from 'sonner';

type Role = 'student' | 'teacher';

interface ImportUsersModalProps {
  open: boolean;
  defaultRole: Role;
  onClose: () => void;
  onDone: () => void;
}

interface ParsedRow {
  fullName: string;
  email: string;
  rollNumber: string;
  department: string;
  phone: string;
  password: string;
  errors: string[];
}

interface ImportResult {
  summary: { total: number; created: number; failed: number };
  created: Array<{ email: string; full_name: string }>;
  failed: Array<{ row: number; email?: string; error: string }>;
}

// --- tiny dependency-free CSV parser (handles quoted fields, commas, CRLF) ---
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field); field = '';
    } else if (ch === '\r') {
      // ignore — newline handled on \n
    } else if (ch === '\n') {
      cur.push(field); rows.push(cur); cur = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedRow, 'errors'>> = {
  fullname: 'fullName', name: 'fullName', studentname: 'fullName', teachername: 'fullName',
  email: 'email', emailaddress: 'email', emailid: 'email',
  rollnumber: 'rollNumber', roll: 'rollNumber', rollno: 'rollNumber', registration: 'rollNumber', regno: 'rollNumber', registrationnumber: 'rollNumber',
  department: 'department', dept: 'department',
  phone: 'phone', mobile: 'phone', contact: 'phone', phonenumber: 'phone', contactnumber: 'phone',
  password: 'password', temppassword: 'password',
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportUsersModal({ open, defaultRole, onClose, onDone }: ImportUsersModalProps) {
  const [role, setRole] = useState<Role>(defaultRole);
  const [defaultPassword, setDefaultPassword] = useState('Welcome@123');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateRow = (r: Omit<ParsedRow, 'errors'>, forRole: Role): string[] => {
    const errs: string[] = [];
    if (!r.fullName || r.fullName.trim().length < 2) errs.push('Name missing');
    if (!r.email || !isEmail(r.email)) errs.push('Invalid email');
    if (forRole === 'student' && !r.rollNumber.trim()) errs.push('Roll number required');
    return errs;
  };

  const handleFile = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.length < 2) {
      toast.error('File appears empty or has no data rows.');
      setRows([]);
      return;
    }
    const headerCols = grid[0].map((h) => HEADER_ALIASES[normalizeHeader(h)]);
    if (!headerCols.includes('email') || !headerCols.includes('fullName')) {
      toast.error('Header row must include at least "fullName" and "email" columns.');
      setRows([]);
      return;
    }
    const parsed: ParsedRow[] = grid.slice(1).map((cols) => {
      const base = { fullName: '', email: '', rollNumber: '', department: '', phone: '', password: '' };
      headerCols.forEach((key, idx) => {
        if (key) base[key] = (cols[idx] ?? '').trim();
      });
      return { ...base, errors: validateRow(base, role) };
    });
    setRows(parsed);
  };

  const onRoleChange = (next: Role) => {
    setRole(next);
    setRows((prev) => prev.map((r) => ({ ...r, errors: validateRow(r, next) })));
  };

  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;

  const passwordValid = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(defaultPassword);

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import.');
      return;
    }
    if (!passwordValid) {
      toast.error('Default password needs 8+ chars, an uppercase letter, a number, and a special character.');
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await authApi.bulkRegister({
        role,
        defaultPassword,
        users: validRows.map((r) => ({
          fullName: r.fullName,
          email: r.email,
          rollNumber: r.rollNumber || undefined,
          department: r.department || undefined,
          phone: r.phone || undefined,
          password: r.password || undefined,
        })),
      });
      const data: ImportResult = res.data ?? res;
      setResult(data);
      if (data.summary.created > 0) {
        toast.success(`Imported ${data.summary.created} ${role}${data.summary.created > 1 ? 's' : ''}.`);
        onDone();
      }
      if (data.summary.failed > 0) {
        toast.error(`${data.summary.failed} row${data.summary.failed > 1 ? 's' : ''} could not be imported.`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = role === 'student'
      ? ['fullName', 'email', 'rollNumber', 'department', 'phone', 'password']
      : ['fullName', 'email', 'department', 'phone', 'password'];
    const examples = role === 'student'
      ? [
          ['Ali Raza', 'ali.raza@school.edu', '22F-BCS-101', 'Computer Science', '03001234567', ''],
          ['Sara Khan', 'sara.khan@school.edu', '22F-BCS-102', 'Computer Science', '', 'Custom@123'],
        ]
      : [
          ['Dr. Imran Malik', 'imran.malik@school.edu', 'Computer Science', '03007654321', ''],
          ['Prof. Ayesha Noor', 'ayesha.noor@school.edu', 'Mathematics', '', 'Custom@123'],
        ];
    downloadCsv(`${role}s_import_template.csv`, [headers, ...examples]);
  };

  const downloadErrors = () => {
    if (!result) return;
    const headers = ['row', 'email', 'error'];
    const body = result.failed.map((f) => [String(f.row), f.email || '', f.error]);
    downloadCsv(`import_errors_${role}.csv`, [headers, ...body]);
  };

  const reset = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Upload size={20} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import {role === 'student' ? 'Students' : 'Teachers'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Import as</label>
              <select
                value={role}
                onChange={(e) => onRoleChange(e.target.value as Role)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Default password (for rows without one)</label>
              <input
                type="text"
                value={defaultPassword}
                onChange={(e) => setDefaultPassword(e.target.value)}
                className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${passwordValid ? 'border-gray-300 focus:ring-primary-500' : 'border-red-300 focus:ring-red-500'}`}
              />
              {!passwordValid && <p className="text-xs text-red-500 mt-1">8+ chars, 1 uppercase, 1 number, 1 special character.</p>}
            </div>
          </div>

          {/* Guide */}
          <div className="border border-blue-200 bg-blue-50 rounded-xl overflow-hidden">
            <button onClick={() => setShowGuide((s) => !s)} className="w-full flex items-center justify-between px-4 py-3 text-left">
              <span className="flex items-center gap-2 text-sm font-medium text-blue-900"><Info size={16} /> How to format your file</span>
              <ChevronDown size={16} className={`text-blue-700 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
            </button>
            {showGuide && (
              <div className="px-4 pb-4 text-sm text-blue-900 space-y-2">
                <p>Upload a <strong>.csv</strong> file with a header row. Recognised columns:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li><code className="bg-blue-100 px-1 rounded">fullName</code> — required (full name)</li>
                  <li><code className="bg-blue-100 px-1 rounded">email</code> — required, must be unique in your institution</li>
                  {role === 'student' && <li><code className="bg-blue-100 px-1 rounded">rollNumber</code> — required for students</li>}
                  <li><code className="bg-blue-100 px-1 rounded">department</code> — optional</li>
                  <li><code className="bg-blue-100 px-1 rounded">phone</code> — optional</li>
                  <li><code className="bg-blue-100 px-1 rounded">password</code> — optional; if blank the default password above is used</li>
                </ul>
                <p className="text-blue-800">Column names are flexible (e.g. <em>Roll No</em>, <em>full name</em>, <em>Email Address</em> all work). Imported users must change their password on first login. Using Excel? Choose <strong>Save As → CSV</strong> first.</p>
                <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100">
                  <Download size={15} /> Download sample template
                </button>
              </div>
            )}
          </div>

          {/* File picker */}
          {!result && (
            <div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div className="flex items-center gap-3">
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
                  <FileText size={16} /> Choose CSV file
                </button>
                <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                  <Download size={16} /> Template
                </button>
                {fileName && <span className="text-sm text-gray-500 truncate">{fileName}</span>}
              </div>
            </div>
          )}

          {/* Preview */}
          {!result && rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-green-700"><CheckCircle2 size={15} /> {validRows.length} ready</span>
                {invalidCount > 0 && <span className="inline-flex items-center gap-1.5 text-red-600"><AlertCircle size={15} /> {invalidCount} with issues (skipped)</span>}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      {role === 'student' && <th className="px-3 py-2">Roll #</th>}
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.errors.length ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-900">{r.fullName || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.email || '—'}</td>
                        {role === 'student' && <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.rollNumber || '—'}</td>}
                        <td className="px-3 py-2 text-gray-600">{r.department || '—'}</td>
                        <td className="px-3 py-2">
                          {r.errors.length === 0
                            ? <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={13} /> OK</span>
                            : <span className="text-red-600 text-xs">{r.errors.join(', ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{result.summary.total}</p>
                  <p className="text-xs text-gray-500">Rows submitted</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.summary.created}</p>
                  <p className="text-xs text-green-600">Created</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.summary.failed}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>
              </div>
              {result.failed.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-3 py-2">Row</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.failed.map((f, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-400">{f.row}</td>
                          <td className="px-3 py-2 text-gray-600">{f.email || '—'}</td>
                          <td className="px-3 py-2 text-red-600">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.failed.length > 0 && (
                <button onClick={downloadErrors} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                  <Download size={15} /> Download error report
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
          {result ? (
            <>
              <button onClick={reset} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Import another file</button>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">Done</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || validRows.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <><Loader2 size={16} className="animate-spin" /> Importing…</> : `Import ${validRows.length || ''} ${role}${validRows.length === 1 ? '' : 's'}`.trim()}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
