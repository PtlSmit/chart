import type { Vulnerability } from './vuln';

export type SortDir = 'asc' | 'desc';
export type SortSpec = { key: keyof Vulnerability; dir: SortDir } | undefined;

