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
  loadFromFile: (file: File) => void;
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
  const ingestedCountRef = useRef(0);
  const [preferences, setPreferencesState] = useState<Preferences>(() => {
    const raw = localStorage.getItem("vuln:prefs");
    return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs;
  });
  const workerRef = useRef<Worker | null>(null);
  const loadedBytes = useRef(0);
  const usingIndexedDB = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

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
    if (!repo) return;
    const cnt = await repo.count(filters);
    setTotal(cnt);
    const out = await repo.query(filters, page * pageSize, pageSize, sort);
    setResults(out);
    const s = await repo.summarize();
    setSummary(s);
  }, [repo, filters, page, pageSize, sort]);

  useEffect(() => {
    refresh();
  }, [filters, page, pageSize, sort]);

  const createFreshWorker = () => {
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      } catch {}
      workerRef.current = null;
    }
    const w = new WorkerCtor();
    workerRef.current = w;
    return w;
  };

  const maybeSwitchToIndexedDB = (bytesLoaded: number) => {
    if (!usingIndexedDB.current && bytesLoaded > 120 * 1024 * 1024) {
      usingIndexedDB.current = true;
      (async () => {
        if (!repo) return;
        const memRepo = repo as MemoryRepository;
        const idb = new IndexedDBRepository();
        const count = await (memRepo as any).count();
        if (count > 0) {
          const batchSize = 10000;
          for (let offset = 0; offset < count; offset += batchSize) {
            const batch = await memRepo.query(
              defaultFilters,
              offset,
              batchSize
            );
            if (batch && batch.length) await idb.addMany(batch);
          }
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
    ingestedCountRef.current = 0;
    loadedBytes.current = 0;
    usingIndexedDB.current = false;
    repoRef.current = new MemoryRepository();
    setRepo(repoRef.current);
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
        // Keep a ref in sync so "done" can reliably report final count
        ingestedCountRef.current += items.length;
        setIngestedCount(ingestedCountRef.current);
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
      } else if (data.type === "done") {
        console.debug(
          "[Data] Load done. Bytes:",
          loadedBytes.current,
          "Items ingested:",
          ingestedCountRef.current
        );
        setLoading(false);
        refresh();
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
  }, [repo, refresh]);

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

  const loadFromFile = useCallback(
    (file: File) => {
      const w = handleWorker();
      console.debug("[Data] loadFromFile", {
        name: file.name,
        size: file.size,
      });
      w.postMessage({ type: "file", file });
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
      loadFromFile,
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
      loadFromFile,
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
      const parts = u.pathname.split("/").filter(Boolean);
      // Expect: [owner, repo, 'blob', branch, path...]
      if (parts.length >= 5 && parts[2] === 'blob') {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const rest = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}