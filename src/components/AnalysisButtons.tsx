import React, { useMemo } from 'react';
import { useData } from '@/context/DataContext';

const KAI_INVALID = 'invalid - norisk';
const AI_INVALID = 'ai-invalid-norisk';

export default function AnalysisButtons() {
  const { setFilters, filters, summary } = useData();
  const excluded = filters.kaiStatusExclude;
  const counts = summary?.kaiStatusCounts ?? {};

  const analysisOn = excluded.has(KAI_INVALID);
  const aiAnalysisOn = excluded.has(AI_INVALID);

  const impactText = useMemo(() => {
    if (!summary) return '';
    const ex = (excluded.has(KAI_INVALID) ? counts[KAI_INVALID] ?? 0 : 0) + (excluded.has(AI_INVALID) ? counts[AI_INVALID] ?? 0 : 0);
    const pct = summary.total > 0 ? Math.round((ex / summary.total) * 100) : 0;
    return `Filtering out ${ex.toLocaleString()} (${pct}%) entries`;
  }, [summary, excluded, counts]);

  return (
    <div className="panel">
      <div className="controls" style={{ gap: '.75rem' }}>
        <button className={analysisOn ? 'primary' : ''}
          onClick={() => setFilters((f) => ({ ...f, kaiStatusExclude: toggleSet(f.kaiStatusExclude, KAI_INVALID) }))}
          title="Hide CVEs marked manually as invalid - norisk">
          Analysis
        </button>
        <button className={aiAnalysisOn ? 'primary' : ''}
          onClick={() => setFilters((f) => ({ ...f, kaiStatusExclude: toggleSet(f.kaiStatusExclude, AI_INVALID) }))}
          title="Hide CVEs marked by AI analysis as invalid - norisk">
          AI Analysis
        </button>
        <span className="chip">{impactText}</span>
        <ImpactBar />
      </div>
    </div>
  );
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const s = new Set(set);
  if (s.has(value)) s.delete(value);
  else s.add(value);
  return s;
}

function ImpactBar() {
  const { summary, filters } = useData();
  if (!summary) return null;
  const counts = summary.kaiStatusCounts;
  const ex = (filters.kaiStatusExclude.has('invalid - norisk') ? counts['invalid - norisk'] ?? 0 : 0)
    + (filters.kaiStatusExclude.has('ai-invalid-norisk') ? counts['ai-invalid-norisk'] ?? 0 : 0);
  const ratio = summary.total ? ex / summary.total : 0;
  return (
    <div className="progress" style={{ width: 240 }}>
      <div style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

