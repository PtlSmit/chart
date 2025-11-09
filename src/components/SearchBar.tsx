import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { useSearchParams } from 'react-router-dom';
import type { Severity } from '@/types/vuln';

export default function SearchBar() {
  const { filters, setFilters, setPage, setSort } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState(filters.query);
  const suggestions = useMemo(() => buildSuggestions(local), [local]);

  const apply = (q: string) => setFilters((f) => ({ ...f, query: q }));

  const resetAll = () => {
    setFilters(() => ({ query: '', severity: new Set<Severity>(), riskFactors: new Set<string>(), kaiStatusExclude: new Set<string>() }));
    setSort(undefined);
    setPage(0);
    const clean = new URLSearchParams();
    setSearchParams(clean, { replace: true });
  };

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input input-bordered w-full md:max-w-md"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(local)}
          placeholder="Search CVE id, title, description…"
        />
        <button className="btn btn-primary" onClick={() => apply(local)}>Search</button>
        <button className="btn btn-ghost" onClick={resetAll}>Reset All</button>
        {!!filters.query && (
          <span className="badge badge-outline">
            Query: {filters.query}
            <button className="btn btn-xs btn-ghost ml-2" onClick={() => apply('')}>Clear</button>
          </span>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="tiny mt-2">
          Suggestions:
          {suggestions.map((s) => (
            <button key={s} className="btn btn-xs btn-ghost ml-2" onClick={() => { setLocal(s); apply(s); }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSuggestions(input: string): string[] {
  if (!input) return [];
  const tokens = input.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  if (!last) return [];
  const pool = ['critical', 'high', 'medium', 'low', 'rce', 'xss', 'sql', 'buffer', 'overflow', 'cwe-79', 'cwe-89'];
  return pool.filter((p) => p.startsWith(last)).slice(0, 6);
}
