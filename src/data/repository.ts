import type { Filters, SummaryMetrics, Vulnerability } from '@/types/vuln';
import { monthKey } from './normalize';

// Typed API responses for remote repository
interface VulnsPageResponse {
  total: number;
  results: Vulnerability[];
}
interface VulnsCountResponse {
  total: number;
}

export interface DataRepository {
  addMany(items: Vulnerability[]): Promise<void>;
  count(filters?: Filters, signal?: AbortSignal): Promise<number>;
  query(
    filters: Filters,
    offset: number,
    limit: number,
    sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' },
    signal?: AbortSignal
  ): Promise<Vulnerability[]>;
  summarize(signal?: AbortSignal): Promise<SummaryMetrics>;
  clear(): Promise<void>;
}

export class MemoryRepository implements DataRepository {
  private data: Vulnerability[] = [];

  async addMany(items: Vulnerability[]) {
    this.data.push(...items);
  }

  async count(filters?: Filters, _signal?: AbortSignal) {
    if (!filters) return this.data.length;
    return this.applyFilters(this.data, filters).length;
  }

  async query(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }, _signal?: AbortSignal) {
    let arr = this.applyFilters(this.data, filters);
    if (sort) {
      const { key, dir } = sort;
      const sevRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
      arr = arr.slice().sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (key === 'severity') {
          const ar = sevRank[String(av ?? 'unknown').toLowerCase()] ?? 0;
          const br = sevRank[String(bv ?? 'unknown').toLowerCase()] ?? 0;
          return dir === 'asc' ? ar - br : br - ar;
        }
        if (key === 'cvss') {
          const af = typeof av === 'number' ? av : (av == null ? Number.NEGATIVE_INFINITY : parseFloat(String(av)));
          const bf = typeof bv === 'number' ? bv : (bv == null ? Number.NEGATIVE_INFINITY : parseFloat(String(bv)));
          return dir === 'asc' ? af - bf : bf - af;
        }
        if (typeof av === 'number' && typeof bv === 'number') {
          return dir === 'asc' ? av - bv : bv - av;
        }
        const as = av == null ? '' : String(av);
        const bs = bv == null ? '' : String(bv);
        if (!as && !bs) return 0;
        if (as < bs) return dir === 'asc' ? -1 : 1;
        if (as > bs) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return arr.slice(offset, offset + limit);
  }

  async summarize() {
    const severityCounts: SummaryMetrics['severityCounts'] = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    };
    const riskFactorCounts: SummaryMetrics['riskFactorCounts'] = {};
    const publishedByMonth: SummaryMetrics['publishedByMonth'] = {};
    const kaiStatusCounts: SummaryMetrics['kaiStatusCounts'] = {};
    for (const v of this.data) {
      severityCounts[v.severity ?? 'unknown'] = (severityCounts[v.severity ?? 'unknown'] ?? 0) + 1;
      if (v.riskFactors) for (const r of v.riskFactors) riskFactorCounts[r] = (riskFactorCounts[r] ?? 0) + 1;
      const mk = monthKey(v.published);
      if (mk) publishedByMonth[mk] = (publishedByMonth[mk] ?? 0) + 1;
      const ks = v.kaiStatus ?? 'unknown';
      kaiStatusCounts[ks] = (kaiStatusCounts[ks] ?? 0) + 1;
    }
    return {
      total: this.data.length,
      severityCounts,
      riskFactorCounts,
      publishedByMonth,
      kaiStatusCounts
    };
  }

  async clear() {
    this.data = [];
  }

  private applyFilters(arr: Vulnerability[], filters: Filters): Vulnerability[] {
    const { query, severity, riskFactors, kaiStatusExclude, dateFrom, dateTo } = filters;
    const q = query.trim().toLowerCase();
    const df = dateFrom ? new Date(dateFrom).getTime() : undefined;
    const dt = dateTo ? new Date(dateTo).getTime() : undefined;
    return arr.filter((v) => {
      if (severity.size && !severity.has(v.severity)) return false;
      if (riskFactors.size && !v.riskFactors?.some((r) => riskFactors.has(r))) return false;
      if (v.kaiStatus && kaiStatusExclude.has(v.kaiStatus)) return false;
      if (df || dt) {
        const t = v.published ? new Date(v.published).getTime() : undefined;
        if (df && (!t || t < df)) return false;
        if (dt && (!t || t > dt)) return false;
      }
      if (q) {
        const hay = `${v.id} ${v.title} ${v.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
}

// Remote repository backed by HTTP API (page-based)
export class RemoteRepository implements DataRepository {
  constructor(private base: string = '/api/v1') {}

  async addMany(_items: Vulnerability[]): Promise<void> {
    // no-op for remote
  }

  private async _fetch(url: string, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(url, signal ? { signal } : { signal: null });
    if (!res.ok) {
      const errorBody: { message?: string } = await res.json().catch(() => ({}));
      const errorMessage = errorBody?.message || res.statusText || `HTTP error! status: ${res.status}`;
      throw new Error(`Failed to fetch from ${url}: ${errorMessage}`);
    }
    return res;
  }

  private async _json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch (err) {
      const where = res.url || 'response';
      throw new Error(`Failed to parse JSON from ${where}: ${String((err as Error)?.message || err)}`);
    }
  }

  private buildParams(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }) {
    const p = new URLSearchParams();
    if (filters.query) p.set('query', filters.query);
    if (filters.severity && filters.severity.size) p.set('severity', Array.from(filters.severity).join(','));
    if (filters.riskFactors && filters.riskFactors.size) p.set('riskFactors', Array.from(filters.riskFactors).join(','));
    if (filters.kaiStatusExclude && filters.kaiStatusExclude.size) p.set('kaiStatusExclude', Array.from(filters.kaiStatusExclude).join(','));
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    p.set('offset', String(offset));
    p.set('limit', String(limit));
    if (sort?.key) p.set('sortKey', String(sort.key));
    if (sort?.dir) p.set('sortDir', sort.dir);
    return p;
  }

  private vulnsUrl() { return this.base.replace(/\/$/, '') + '/vulns'; }
  private summaryUrl() { return this.base.replace(/\/$/, '') + '/summary'; }

  async count(filters?: Filters, signal?: AbortSignal): Promise<number> {
    const f = filters ?? { query: '', severity: new Set(), riskFactors: new Set(), kaiStatusExclude: new Set() } as Filters;
    const params = this.buildParams(f, 0, 0);
    const res = await this._fetch(this.vulnsUrl() + '?' + params.toString(), signal);
    const json = await this._json<VulnsCountResponse>(res);
    return Number(json.total ?? 0);
  }

  async query(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }, signal?: AbortSignal): Promise<Vulnerability[]> {
    const params = this.buildParams(filters, offset, limit, sort);
    const res = await this._fetch(this.vulnsUrl() + '?' + params.toString(), signal);
    const json = await this._json<VulnsPageResponse>(res);
    return Array.isArray(json.results) ? json.results : [];
  }

  async summarize(signal?: AbortSignal): Promise<SummaryMetrics> {
    const res = await this._fetch(this.summaryUrl(), signal);
    return await this._json<SummaryMetrics>(res);
  }

  async clear(): Promise<void> {
    // no-op for remote
  }
}

// Minimal IndexedDB repo for very large datasets
export class IndexedDBRepository implements DataRepository {
  private dbp: Promise<IDBDatabase>;
  private store = 'vulns';
  constructor(name = 'vuln-db') {
    this.dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.store)) {
          const os = db.createObjectStore(this.store, { keyPath: 'id' });
          os.createIndex('severity', 'severity', { unique: false });
          os.createIndex('published', 'published', { unique: false });
          os.createIndex('kaiStatus', 'kaiStatus', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx(mode: IDBTransactionMode) {
    const db = await this.dbp;
    return db.transaction(this.store, mode).objectStore(this.store);
  }

  async addMany(items: Vulnerability[]): Promise<void> {
    const store = await this.tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= items.length) return resolve();
        const req = store.put(items[i++]);
        req.onsuccess = next;
        req.onerror = () => reject(req.error);
      };
      next();
    });
  }

  async count(filters?: Filters): Promise<number> {
    if (!filters) {
      const store = await this.tx('readonly');
      return await new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const all = await this.query(filters, 0, Number.MAX_SAFE_INTEGER);
    return all.length; // simple but effective, can optimize by indexes later
  }

  async query(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }, _signal?: AbortSignal): Promise<Vulnerability[]> {
    const store = await this.tx('readonly');
    const out: Vulnerability[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      let skipped = 0;
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) return resolve();
        const v = cursor.value as Vulnerability;
        if (this.applyFilters([v], filters).length) {
          if (skipped < offset) skipped++;
          else if (out.length < limit) out.push(v);
          else return resolve();
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    if (sort) {
      const { key, dir } = sort;
      const sevRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
      out.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (key === 'severity') {
          const ar = sevRank[String(av ?? 'unknown').toLowerCase()] ?? 0;
          const br = sevRank[String(bv ?? 'unknown').toLowerCase()] ?? 0;
          return dir === 'asc' ? ar - br : br - ar;
        }
        if (key === 'cvss') {
          const af = typeof av === 'number' ? av : (av == null ? Number.NEGATIVE_INFINITY : parseFloat(String(av)));
          const bf = typeof bv === 'number' ? bv : (bv == null ? Number.NEGATIVE_INFINITY : parseFloat(String(bv)));
          return dir === 'asc' ? af - bf : bf - af;
        }
        if (typeof av === 'number' && typeof bv === 'number') {
          return dir === 'asc' ? av - bv : bv - av;
        }
        const as = av == null ? '' : String(av);
        const bs = bv == null ? '' : String(bv);
        if (!as && !bs) return 0;
        if (as < bs) return dir === 'asc' ? -1 : 1;
        if (as > bs) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return out;
  }

  async summarize(): Promise<SummaryMetrics> {
    const severityCounts: SummaryMetrics['severityCounts'] = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    const riskFactorCounts: SummaryMetrics['riskFactorCounts'] = {};
    const publishedByMonth: SummaryMetrics['publishedByMonth'] = {};
    const kaiStatusCounts: SummaryMetrics['kaiStatusCounts'] = {};
    const store = await this.tx('readonly');
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) return resolve();
        const v = cursor.value as Vulnerability;
        severityCounts[v.severity ?? 'unknown'] = (severityCounts[v.severity ?? 'unknown'] ?? 0) + 1;
        if (v.riskFactors) for (const r of v.riskFactors) riskFactorCounts[r] = (riskFactorCounts[r] ?? 0) + 1;
        const mk = monthKey(v.published);
        if (mk) publishedByMonth[mk] = (publishedByMonth[mk] ?? 0) + 1;
        const ks = v.kaiStatus ?? 'unknown';
        kaiStatusCounts[ks] = (kaiStatusCounts[ks] ?? 0) + 1;
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    const total = Object.values(severityCounts).reduce((a, b) => a + b, 0);
    return { total, severityCounts, riskFactorCounts, publishedByMonth, kaiStatusCounts };
  }

  async clear(): Promise<void> {
    const store = await this.tx('readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private applyFilters(arr: Vulnerability[], f: Filters) {
    // reuse MemoryRepository logic with small inline filter
    const { query, severity, riskFactors, kaiStatusExclude, dateFrom, dateTo } = f;
    const q = query.trim().toLowerCase();
    const df = dateFrom ? new Date(dateFrom).getTime() : undefined;
    const dt = dateTo ? new Date(dateTo).getTime() : undefined;
    return arr.filter((v) => {
      if (severity.size && !severity.has(v.severity)) return false;
      if (riskFactors.size && !v.riskFactors?.some((r) => riskFactors.has(r))) return false;
      if (v.kaiStatus && kaiStatusExclude.has(v.kaiStatus)) return false;
      if (df || dt) {
        const t = v.published ? new Date(v.published).getTime() : undefined;
        if (df && (!t || t < df)) return false;
        if (dt && (!t || t > dt)) return false;
      }
      if (q) {
        const hay = `${v.id} ${v.title} ${v.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
}
