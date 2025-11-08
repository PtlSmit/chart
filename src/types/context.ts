import type { Filters, Preferences, SummaryMetrics, Vulnerability } from './vuln';
import type { SortSpec } from './common';
import type { DataRepository } from '@/data/repository';

export interface DataState {
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

