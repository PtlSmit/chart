import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
// streaming worker removed in page-based remote mode
import type { Filters, Preferences, SummaryMetrics, Vulnerability } from "@/types/vuln";
import type { SortSpec } from "@/types/common";
import type { DataState } from "@/types/context";
import { type DataRepository, RemoteRepository } from "@/data/repository";
import { getDefaultVulnsEndpoint } from "@/services/dataService";

// Types moved to src/types/common.ts and src/types/context.ts

const defaultFilters: Filters = {
  query: "",
  severity: new Set(),
  riskFactors: new Set(),
  kaiStatusExclude: new Set(),
};

const defaultPrefs: Preferences = {
  darkMode: false,
  pageSize: 50,
  defaultExcludeKai: false,
};

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<DataRepository | null>(null);
  const repoRef = useRef<DataRepository | null>(null);
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<Filters>(() => defaultFilters);
  const [sort, setSort] = useState<SortSpec>(undefined);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Vulnerability[]>([]);
  const [progressBytes, setProgressBytes] = useState(0);
  const [ingestedCount, setIngestedCount] = useState(0);
  const [preferences, setPreferencesState] = useState<Preferences>(() => {
    const raw = localStorage.getItem("vuln:prefs");
    return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs;
  });
  const lastUrlRef = useRef<string | null>(null);
  // Throttled refresh controls for incremental updates
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const isRefreshingRef = useRef(false);

  // Cleanup any pending refresh timer on unmount to avoid leaks
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPageSize(preferences.pageSize);
    document.documentElement.dataset.theme = preferences.darkMode ? "dark" : "light";
    // Enable Tailwind's dark: utilities by toggling the 'dark' class on <html>
    document.documentElement.classList.toggle('dark', preferences.darkMode);
  }, [preferences]);

  const setFilters = useCallback((updater: (f: Filters) => Filters) => {
    setPage(0);
    setFiltersState((prev) =>
      updater({
        ...prev,
        severity: new Set(prev.severity),
        riskFactors: new Set(prev.riskFactors),
        kaiStatusExclude: new Set(prev.kaiStatusExclude),
      })
    );
  }, []);

  const setPreferences = useCallback(
    (updater: (p: Preferences) => Preferences) => {
      setPreferencesState((prev) => {
        const next = updater(prev);
        localStorage.setItem("vuln:prefs", JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const attachRepo = useCallback(
    async (r: DataRepository) => {
      repoRef.current = r;
      setRepo(r);
      const s = await r.summarize();
      setSummary(s);
      const cnt = await r.count(filters);
      setTotal(cnt);
      const out = await r.query(filters, page * pageSize, pageSize, sort);
      setResults(out);
    },
    [filters, page, pageSize, sort]
  );

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    const r = repoRef.current;
    if (!r) return;
    isRefreshingRef.current = true;
    try {
      const cnt = await r.count(filters);
      setTotal(cnt);
      const out = await r.query(filters, page * pageSize, pageSize, sort);
      setResults(out);
      const s = await r.summarize();
      setSummary(s);
      lastRefreshAtRef.current = Date.now();
    } finally {
      isRefreshingRef.current = false;
    }
  }, [filters, page, pageSize, sort]);

  const scheduleRefresh = useCallback(() => {
    if (!repoRef.current) return;
    const THROTTLE_MS = 500;
    const now = Date.now();
    const since = now - lastRefreshAtRef.current;
    // If enough time has elapsed and we're not currently refreshing, run immediately
    if (since >= THROTTLE_MS && !isRefreshingRef.current) {
      void refresh();
      return;
    }
    // Otherwise, ensure one pending timer exists
    if (refreshTimerRef.current == null) {
      const wait = Math.max(50, THROTTLE_MS - since);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void refresh();
      }, wait);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [filters, page, pageSize, sort]);

  // no worker in remote/page-based mode

  // no indexedDB migration in remote mode
  const maybeSwitchToIndexedDB = (_bytesLoaded: number) => {};

  // no worker handler in remote mode
  const handleWorker = useCallback(() => null, []);

  const loadFromUrl = useCallback(async (url: string) => {
    // derive API base (accept either base '/api/v1' or '/api/v1/vulns')
    const base = url.replace(/\/?vulns\/?$/, '');
    repoRef.current = new RemoteRepository(base || getDefaultVulnsEndpoint().replace(/\/?vulns\/?$/, ''));
    setRepo(repoRef.current);
    lastUrlRef.current = base;
    setLoading(true);
    setError(null);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const value: DataState = useMemo(
    () => ({
      repo,
      summary,
      loading,
      error,
      progressBytes,
      ingestedCount,
      filters,
      sort,
      page,
      pageSize,
      total,
      results,
      preferences,
      loadFromUrl,
      setFilters,
      setSort,
      setPage,
      setPreferences,
      refresh,
    }),
    [
      repo,
      summary,
      loading,
      error,
      filters,
      sort,
      page,
      pageSize,
      total,
      results,
      preferences,
      loadFromUrl,
      setFilters,
      setSort,
      setPage,
      setPreferences,
      refresh,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

// toFetchableUrl moved to services/dataService
