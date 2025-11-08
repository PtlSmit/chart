import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { VirtualList } from '@/utils/virtualize';
import type { Vulnerability } from '@/types/vuln';
import type { SortSpec } from '@/types/common';
import VulnCompareDrawer from '@/components/VulnCompareDrawer';

export default function VulnList() {
  const { results, total, page, pageSize, setPage, setSort, sort } = useData();
  const [selected, setSelected] = useState<Record<string, Vulnerability>>({});
  const nav = useNavigate();

  const toggleSelect = (v: Vulnerability) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[v.id]) delete next[v.id]; else next[v.id] = v;
      return next;
    });
  };

  const pages = Math.ceil(total / pageSize) || 1;

  const headers: { key: keyof Vulnerability; label: string; width: number }[] = [
    { key: 'id', label: 'ID', width: 200 },
    { key: 'title', label: 'Title', width: 420 },
    { key: 'severity', label: 'Severity', width: 120 },
    { key: 'published', label: 'Published', width: 160 },
    { key: 'cvss', label: 'CVSS', width: 80 },
    { key: 'kaiStatus', label: 'kaiStatus', width: 200 },
  ];

  const header = (
    <div className="list-row" style={{ fontWeight: 600 }}>
      <div style={{ width: 40 }} />
      {headers.map((h) => (
        <div key={h.key as string} style={{ width: h.width, cursor: 'pointer' }} onClick={() => setSort(nextSort(sort, h.key))}>
          {h.label} {sort?.key === h.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
        </div>
      ))}
    </div>
  );

  const rows = useMemo(() => results, [results]);

  return (
    <div className="panel">
      <div className="controls" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{total.toLocaleString()}</strong> results • Page {page + 1} / {pages}
        </div>
        <div>
          <button className="ghost" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Prev</button>
          <button className="ghost" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Next</button>
        </div>
      </div>
      {header}
      <VirtualList items={rows} itemHeight={48} height={420} render={(v) => (
        <Row key={v.id} v={v} selected={!!selected[v.id]} onSelect={() => toggleSelect(v)} onOpen={() => nav(`/vuln/${encodeURIComponent(v.id)}`)} />
      )} />
      <VulnCompareDrawer items={Object.values(selected)} />
    </div>
  );
}

function Row({ v, selected, onSelect, onOpen }: { v: Vulnerability; selected: boolean; onSelect: () => void; onOpen: () => void; }) {
  return (
    <>
      <div style={{ width: 40 }}>
        <input type="checkbox" checked={selected} onChange={onSelect} />
      </div>
      <div style={{ width: 200 }}><button className="ghost" onClick={onOpen}>{v.id}</button></div>
      <div style={{ width: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
      <div style={{ width: 120 }}><SeverityBadge s={v.severity} /></div>
      <div style={{ width: 160 }}>{v.published?.slice(0, 10) ?? '-'}</div>
      <div style={{ width: 80 }}>{v.cvss ?? '-'}</div>
      <div style={{ width: 200 }}>{v.kaiStatus ?? '-'}</div>
    </>
  );
}

function SeverityBadge({ s }: { s: Vulnerability['severity'] }) {
  const cls = s === 'critical' ? 'sev-critical' : s === 'high' ? 'sev-high' : s === 'medium' ? 'sev-medium' : s === 'low' ? 'sev-low' : '';
  return <span className={`badge ${cls}`}>{s}</span>;
}

function nextSort(current: SortSpec, key: keyof Vulnerability) {
  if (!current || current.key !== key) return { key, dir: 'asc' as const };
  if (current.dir === 'asc') return { key, dir: 'desc' as const };
  return undefined;
}
