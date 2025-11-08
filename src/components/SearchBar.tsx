import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';

export default function SearchBar() {
  const { filters, setFilters } = useData();
  const [local, setLocal] = useState(filters.query);
  const suggestions = useMemo(() => buildSuggestions(local), [local]);

  const apply = (q: string) => setFilters((f) => ({ ...f, query: q }));

  return (
    <div className="panel">
      <div className="controls" style={{ gap: '.75rem' }}>
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(local)}
          placeholder="Search CVE id, title, description…"
          style={{ minWidth: 300 }}
        />
        <button className="primary" onClick={() => apply(local)}>Search</button>
        {!!filters.query && (
          <span className="chip">Query: {filters.query} <button className="ghost" onClick={() => apply('')}>×</button></span>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="tiny" style={{ marginTop: '.5rem' }}>
          Suggestions:
          {suggestions.map((s) => (
            <button key={s} className="ghost" style={{ marginLeft: '.5rem' }} onClick={() => { setLocal(s); apply(s); }}>{s}</button>
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

