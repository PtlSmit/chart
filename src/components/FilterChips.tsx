import React from 'react';
import { useData } from '@/context/DataContext';
import { toggleSet } from '@/utils/filters';
import type { Severity } from '@/types/vuln';

const ALL_SEV: Severity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

export default function FilterChips() {
  const { filters, setFilters, summary } = useData();

  const toggleSev = (s: Severity) => setFilters((f) => ({ ...f, severity: toggleSet(f.severity, s) }));

  return (
    <div className="panel">
      <div className="controls">
        <span className="hint">Severity:</span>
        {ALL_SEV.map((s) => (
          <button key={s} onClick={() => toggleSev(s)} className={filters.severity.has(s) ? 'primary' : ''}>
            {s} {summary ? <span className="tiny">({summary.severityCounts[s] ?? 0})</span> : null}
          </button>
        ))}
      </div>
      <RiskFactorChips />
      <DateFilters />
    </div>
  );
}

function RiskFactorChips() {
  const { summary, filters, setFilters } = useData();
  if (!summary) return null;
  const top = Object.entries(summary.riskFactorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const toggle = (k: string) => setFilters((f) => ({ ...f, riskFactors: toggleSet(f.riskFactors, k) }));

  return (
    <div className="controls" style={{ marginTop: '.5rem' }}>
      <span className="hint">Risk factors:</span>
      {top.map(([k, n]) => (
        <button key={k} onClick={() => toggle(k)} className={filters.riskFactors.has(k) ? 'primary' : ''}>{k} <span className="tiny">({n})</span></button>
      ))}
    </div>
  );
}

function DateFilters() {
  const { filters, setFilters } = useData();
  return (
    <div className="controls" style={{ marginTop: '.5rem' }}>
      <span className="hint">Date:</span>
      <input type="date" value={filters.dateFrom?.slice(0,10) ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
      <span className="hint">to</span>
      <input type="date" value={filters.dateTo?.slice(0,10) ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
      {(filters.dateFrom || filters.dateTo) && <button className="ghost" onClick={() => setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined }))}>Clear</button>}
    </div>
  );
}
