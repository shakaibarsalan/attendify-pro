import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const [jump, setJump] = useState('');
  if (totalPages <= 1) return null;

  const go = (p: number) => onPageChange(Math.min(totalPages, Math.max(1, p)));

  // Windowed page list: first, current±1, last, with … gaps.
  const items: (number | 'gap')[] = [];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(totalPages - 1, page + 1);
  items.push(1);
  if (lo > 2) items.push('gap');
  for (let p = lo; p <= hi; p++) items.push(p);
  if (hi < totalPages - 1) items.push('gap');
  items.push(totalPages);

  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jump, 10);
    if (!Number.isNaN(n)) go(n);
    setJump('');
  };

  const navBtn = 'p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center justify-between gap-3 py-3 flex-wrap">
      <p className="text-sm text-gray-500">
        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => go(page - 1)} disabled={page <= 1} className={navBtn} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>

        {items.map((it, i) =>
          it === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-gray-400 select-none">…</span>
          ) : (
            <button
              key={it}
              onClick={() => go(it)}
              aria-current={it === page ? 'page' : undefined}
              className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                it === page ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {it}
            </button>
          ),
        )}

        <button onClick={() => go(page + 1)} disabled={page >= totalPages} className={navBtn} aria-label="Next page">
          <ChevronRight size={16} />
        </button>

        <form onSubmit={submitJump} className="flex items-center gap-1.5 ml-1">
          <span className="text-xs text-gray-400 whitespace-nowrap">Go to</span>
          <input
            type="number" min={1} max={totalPages} value={jump}
            onChange={(e) => setJump(e.target.value)} placeholder={String(page)}
            aria-label="Go to page"
            className="w-14 h-8 px-2 border border-gray-200 rounded-lg text-sm text-center text-gray-700 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button type="submit" className="h-8 px-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Go</button>
        </form>
      </div>
    </div>
  );
}
