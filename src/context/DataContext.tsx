import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import WorkerCtor from "@/workers/jsonStream.worker.ts?worker";
import type {
  Filters,
  Preferences,
  SummaryMetrics,
  Vulnerability,
} from "@/types/vuln";
import {
  IndexedDBRepository,
  MemoryRepository,
  type DataRepository,
} from "@/data/repository";

type SortSpec = { key: keyof Vulnerability; dir: "asc" | "desc" } | undefined;

interface DataState {
  repo: DataRepository | null;
  summary: SummaryMetrics | null;
  loading: boolean;
  error: string | null;
  progressBytes: number;
  ingestedCount: number;
  filters: Filters;
  sort: SortSpec;
  page: number;
  pageSize: number;
  total: number;
  results: Vulnerability[];
  preferences: Preferences;
  loadFromUrl: (url: string) => void;
  setFilters: (updater: (f: Filters) => Filters) => void;
  setSort: (sort: SortSpec) => void;
  setPage: (page: number) => void;
  setPreferences: (updater: (p: Preferences) => Preferences) => void;
  refresh: () => void;
}

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
  const workerRef = useRef<Worker | null>(null);
  const loadedBytes = useRef(0);
  const usingIndexedDB = useRef(false);
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
    document.documentElement.dataset.theme = preferences.darkMode
      ? "dark"
      : "light";
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

  const createFreshWorker = () => {
    // Always start with a fresh worker to avoid queuing a new job behind a long-running one
    // and to ensure listeners/state are clean per load action.
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      } catch {}
    }
    // Vite `?worker` import provides a Worker constructor that's bundler-safe in dev and build
    const w = new WorkerCtor();
    workerRef.current = w;
    return w;
  };

  const maybeSwitchToIndexedDB = (bytesLoaded: number) => {
    if (!usingIndexedDB.current && bytesLoaded > 120 * 1024 * 1024) {
      // threshold ~120MB
      usingIndexedDB.current = true;
      // migrate from memory to IndexedDB for scalability
      (async () => {
        if (!repo) return;
        const memRepo = repo as MemoryRepository;
        const idb = new IndexedDBRepository();
        const count = await (memRepo as any).count();
        if (count > 0) {
          // naive migration: re-query all
          const all = await memRepo.query(
            defaultFilters,
            0,
            Number.MAX_SAFE_INTEGER
          );
          await idb.addMany(all);
        }
        setRepo(idb);
      })();
    }
  };

  const handleWorker = useCallback(() => {
    const w = createFreshWorker();
    console.debug("[Data] Starting load; resetting state");
    setLoading(true);
    setError(null);
    setSummary(null);
    setResults([]);
    setTotal(0);
    setProgressBytes(0);
    setIngestedCount(0);
    loadedBytes.current = 0;
    usingIndexedDB.current = false;
    repoRef.current = new MemoryRepository();
    setRepo(repoRef.current);
    // reset throttling state
    if (refreshTimerRef.current != null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    lastRefreshAtRef.current = 0;
    const handleMessage = async (ev: MessageEvent<any>) => {
      const data = ev.data as any;
      if (data.type === "progress") {
        loadedBytes.current = data.bytes;
        setProgressBytes(data.bytes);
        maybeSwitchToIndexedDB(loadedBytes.current);
      } else if (data.type === "log") {
        console.debug("[Worker]", data.message);
      } else if (data.type === "items") {
        const items = data.items as Vulnerability[];
        setIngestedCount((n) => n + items.length);
        // write to whichever repo is current
        if (usingIndexedDB.current) {
          const idb =
            repoRef.current instanceof IndexedDBRepository
              ? repoRef.current
              : new IndexedDBRepository();
          await idb.addMany(items);
          repoRef.current = idb;
          setRepo(idb);
        } else if (repoRef.current) {
          await repoRef.current.addMany(items);
        }
        // trigger an incremental UI refresh (throttled)
        scheduleRefresh();
      } else if (data.type === "done") {
        console.debug(
          "[Data] Load done. Bytes:",
          loadedBytes.current,
          "Items ingested:",
          ingestedCount
        );
        setLoading(false);
        // final refresh to show complete results immediately
        if (refreshTimerRef.current != null) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        await refresh();
        w.removeEventListener("message", handleMessage as any);
      } else if (data.type === "error") {
        console.error("[Data] Load error:", data.error);
        setLoading(false);
        let msg = data.error as string;
        const last = lastUrlRef.current;
        if (msg && msg.toLowerCase().includes("failed to fetch") && last) {
          try {
            const u = new URL(last);
            if (u.hostname === "github.com" && u.pathname.includes("/blob/")) {
              msg =
                'Failed to fetch. Tip: GitHub "blob" URLs are not fetchable due to CORS. Use the raw URL instead (raw.githubusercontent.com) or upload the file.';
            }
          } catch {}
        }
        setError(msg);
        w.removeEventListener("message", handleMessage as any);
      }
    };
    w.addEventListener("message", handleMessage as any);
    return w;
  }, [scheduleRefresh, refresh]);

  const loadFromUrl = useCallback(
    (url: string) => {
      const w = handleWorker();
      const safe = toFetchableUrl(url);
      lastUrlRef.current = url;
      console.debug("[Data] loadFromUrl", { url, safe });
      w.postMessage({ type: "fetch", url: safe });
    },
    [handleWorker]
  );

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

function toFetchableUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "github.com" && u.pathname.includes("/blob/")) {
      // https://github.com/{owner}/{repo}/blob/{branch}/{path} -> https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
      const parts = u.pathname.split("/").filter(Boolean);
      const owner = parts[0];
      const repo = parts[1];
      const branch = parts[3];
      const rest = parts.slice(4).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest}`;
    }
    return url;
  } catch {
    return url;
  }
}
