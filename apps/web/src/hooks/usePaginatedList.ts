import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface UsePaginatedListOptions {
  url: string;
  params?: Record<string, string | number | undefined>;
  page?: number;
  limit?: number;
  autoFetch?: boolean;
}

interface UsePaginatedListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setPage: (p: number) => void;
  setParams: (p: Record<string, string | number | undefined>) => void;
}

export function usePaginatedList<T = any>(options: UsePaginatedListOptions): UsePaginatedListResult<T> {
  const { url, params: initialParams = {}, page: initialPage = 1, limit = 20, autoFetch = true } = options;

  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParamsState] = useState(initialParams);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const setParams = useCallback((newParams: Record<string, string | number | undefined>) => {
    setParamsState(newParams);
    setPage(1);
  }, []);

  useEffect(() => {
    if (!autoFetch) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const queryParams: Record<string, string> = { page: String(page), limit: String(limit) };
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') queryParams[k] = String(v);
    }

    api.get(url, { params: queryParams })
      .then((res: any) => {
        if (cancelled) return;
        const result = res.data ?? res;
        setData(result.data || []);
        setTotal(result.total || 0);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.response?.data?.error || err.message || 'Failed to fetch');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url, page, limit, params, refreshKey, autoFetch]);

  return { data, total, page, limit, loading, error, refresh, setPage, setParams };
}
