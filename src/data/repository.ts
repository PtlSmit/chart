import type { Filters, SummaryMetrics, Vulnerability } from '@/types/vuln';
import { monthKey } from './normalize';

export interface DataRepository {
  addMany(items: Vulnerability[]): Promise<void>;
  count(filters?: Filters): Promise<number>;
  query(
    filters: Filters,
    offset: number,
    limit: number,
    sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }
  ): Promise<Vulnerability[]>;
  summarize(): Promise<SummaryMetrics>;
  clear(): Promise<void>;
}

export class MemoryRepository implements DataRepository {
  private data: Vulnerability[] = [];

  async addMany(items: Vulnerability[]) {
    this.data.push(...items);
  }

  async count(filters?: Filters) {
    if (!filters) return this.data.length;
    return this.applyFilters(this.data, filters).length;
  }

  async query(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }) {
    let arr = this.applyFilters(this.data, filters);
    if (sort) {
      const { key, dir } = sort;
      arr = arr.slice().sort((a, b) => {
        const av = a[key];
        const bv = b[key];
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

  async query(filters: Filters, offset: number, limit: number, sort?: { key: keyof Vulnerability; dir: 'asc' | 'desc' }): Promise<Vulnerability[]> {
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
      out.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
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
