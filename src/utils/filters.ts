import type { Filters } from '@/types/vuln';

export function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const s = new Set(set);
  if (s.has(value)) s.delete(value);
  else s.add(value);
  return s;
}

export function cloneFilters(f: Filters): Filters {
  return {
    ...f,
    severity: new Set(f.severity),
    riskFactors: new Set(f.riskFactors),
    kaiStatusExclude: new Set(f.kaiStatusExclude),
  };
}

