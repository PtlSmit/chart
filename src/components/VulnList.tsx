import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "@/context/DataContext";
import { VirtualList } from "@/utils/virtualize";
import type { Vulnerability, Severity } from "@/types/vuln";
import type { SortSpec } from "@/types/common";
import VulnCompareDrawer from "@/components/VulnCompareDrawer";

export default function VulnList() {
  const { results, total, page, pageSize, setPage, setSort, sort, setPreferences, filters, setFilters } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Record<string, Vulnerability>>({});
  const nav = useNavigate();

  const toggleSelect = (v: Vulnerability) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[v.id]) delete next[v.id];
      else next[v.id] = v;
      return next;
    });
  };

  const pages = Math.ceil(total / pageSize) || 1;

  const headers: { key: keyof Vulnerability; label: string; className?: string }[] = [
    { key: "id", label: "ID", className: "w-[140px]" },
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity", className: "w-[90px]" },
    { key: "published", label: "Published", className: "hidden lg:table-cell w-[120px]" },
    { key: "cvss", label: "CVSS", className: "hidden lg:table-cell w-[60px]" },
    { key: "kaiStatus", label: "kaiStatus", className: "hidden xl:table-cell w-[160px]" },
  ];

  const headerRow = (
    <tr>
      <th className="w-10" scope="col" aria-sort="none"></th>
      {headers.map((h) => {
        const ariaSort = sort?.key === h.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        return (
          <th key={h.key as string} className={h.className || ''} scope="col" aria-sort={ariaSort}>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setSort(nextSort(sort, h.key))}
              aria-label={`Sort by ${h.label}${ariaSort !== 'none' ? ` (${ariaSort})` : ''}`}
            >
              {h.label}{" "}
              {sort?.key === h.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
            </button>
          </th>
        );
      })}
    </tr>
  );

  const rows = useMemo(() => results, [results]);

  const useTable = total <= 2000; // Use a regular table for smaller datasets on desktop

  // Mobile sort helpers
  const SORT_KEYS: Array<{ key: keyof Vulnerability; label: string }> = [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity" },
    { key: "published", label: "Published" },
    { key: "cvss", label: "CVSS" },
    { key: "kaiStatus", label: "kaiStatus" },
  ];
  const setSortKey = (k: keyof Vulnerability) => {
    if (!sort || sort.key !== k) setSort({ key: k, dir: "asc" });
    else setSort({ key: k, dir: sort.dir });
  };
  const toggleSortDir = () => {
    if (!sort) return;
    setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  };

  const changePageSize = (n: number) => {
    setPreferences((p) => ({ ...p, pageSize: n }));
    setPage(0);
  };

  const PageSizeControl = (
    <div className="flex items-center gap-2">
      <span className="text-xs opacity-70">Page size</span>
      <select
        className="select select-bordered select-xs"
        value={pageSize}
        onChange={(e) => changePageSize(Number(e.target.value))}
      >
        {[25, 50, 100, 200].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );

  // Sync from URL → state on mount
  useEffect(() => {
    const p = Number(searchParams.get('p'));
    const s = Number(searchParams.get('size'));
    const sk = searchParams.get('sort') as keyof Vulnerability | null;
    const sd = searchParams.get('dir') as 'asc' | 'desc' | null;
    if (Number.isFinite(p) && p >= 1) setPage(p - 1);
    if (Number.isFinite(s) && s > 0) setPreferences((pr) => ({ ...pr, pageSize: s }));
    if (sk) setSort({ key: sk as keyof Vulnerability, dir: sd === 'desc' ? 'desc' : 'asc' });
    // Filters: q, sev, rf, from, to, kx
    const q = searchParams.get('q');
    const sev = searchParams.get('sev');
    const rf = searchParams.get('rf');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const kx = searchParams.get('kx');
    if (q || sev || rf || from || to || kx) {
      setFilters((f) => ({
        ...f,
        query: q ?? f.query,
        severity: sev ? new Set<Severity>(sev.split(',').filter(Boolean) as Severity[]) : f.severity,
        riskFactors: rf ? new Set(rf.split(',').filter(Boolean)) : f.riskFactors,
        kaiStatusExclude: kx ? new Set(kx.split(',').filter(Boolean)) : f.kaiStatusExclude,
        dateFrom: from || undefined,
        dateTo: to || undefined,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state → URL when page/pageSize/sort change
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('p', String(page + 1));
    next.set('size', String(pageSize));
    if (sort?.key) next.set('sort', String(sort.key)); else next.delete('sort');
    if (sort?.dir) next.set('dir', sort.dir); else next.delete('dir');
    // Filters
    if (filters.query) next.set('q', filters.query); else next.delete('q');
    const sev = Array.from(filters.severity).sort();
    const rf = Array.from(filters.riskFactors).sort();
    const kx = Array.from(filters.kaiStatusExclude).sort();
    if (sev.length) next.set('sev', sev.join(',')); else next.delete('sev');
    if (rf.length) next.set('rf', rf.join(',')); else next.delete('rf');
    if (kx.length) next.set('kx', kx.join(',')); else next.delete('kx');
    if (filters.dateFrom) next.set('from', filters.dateFrom); else next.delete('from');
    if (filters.dateTo) next.set('to', filters.dateTo); else next.delete('to');
    // Only push if changed to avoid loops
    const changed = next.toString() !== searchParams.toString();
    if (changed) setSearchParams(next, { replace: true });
  }, [page, pageSize, sort, filters, searchParams, setSearchParams]);

  // Numbered pagination with ellipses
  const pageRange = (totalPages: number, current: number, delta = 2): (number | '…')[] => {
    const result: (number | '…')[] = [];
    if (totalPages <= 1) return [0];
    const start = Math.max(0, current - delta);
    const end = Math.min(totalPages - 1, current + delta);
    // Always include first
    result.push(0);
    if (start > 1) result.push('…');
    for (let i = start; i <= end; i++) {
      if (i !== 0 && i !== totalPages - 1) result.push(i);
    }
    if (end < totalPages - 2) result.push('…');
    if (totalPages > 1) result.push(totalPages - 1);
    // Deduplicate consecutive duplicates (can happen near edges)
    return result.filter((v, i, a) => (i === 0 ? true : v !== a[i - 1]));
  };

  const pagesToShow = useMemo(() => pageRange(pages, page), [pages, page]);
  const goto = (n: number) => setPage(Math.max(0, Math.min(pages - 1, n)));
  const [gotoInput, setGotoInput] = useState("");
  const gotoInputEl = (
    <div className="flex items-center gap-1">
      <span className="text-xs opacity-70">Go to</span>
      <input
        className="input input-bordered input-xs w-14"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={`${page + 1}`}
        value={gotoInput}
        onChange={(e) => setGotoInput(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = Number(gotoInput);
            if (Number.isFinite(n) && n >= 1) goto(n - 1);
            setGotoInput("");
          }
        }}
      />
    </div>
  );

  return (
    <div className="panel">
      <ControlsMemo
        sort={sort}
        setSortKey={setSortKey}
        toggleSortDir={toggleSortDir}
        SORT_KEYS={SORT_KEYS}
        PageSizeControl={PageSizeControl}
        pagesToShow={pagesToShow}
        goto={goto}
        page={page}
        pages={pages}
        gotoInputEl={gotoInputEl}
        setPage={setPage}
      />

      {/* Mobile: stacked cards for best readability */}
      <div className="md:hidden mt-3 space-y-2">
        {rows.map((v) => (
          <div key={v.id} className="card bg-base-200">
            <div className="card-body p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={!!selected[v.id]}
                    onChange={() => toggleSelect(v)}
                    aria-label={`Select ${v.id}`}
                  />
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => nav(`/vuln/${encodeURIComponent(v.id)}`)}
                    aria-label={`Open details for ${v.id}`}
                  >
                    {v.id}
                  </button>
                </div>
                <div className="shrink-0">
                  <SeverityBadge s={v.severity} />
                </div>
              </div>
              <div className="text-sm text-left truncate" title={v.title}>
                {v.title}
              </div>
              <div className="text-xs text-left text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="opacity-70">Published:</span>{" "}
                  {v.published?.slice(0, 10) ?? "-"}
                </span>
                <span>
                  <span className="opacity-70">CVSS:</span> {v.cvss ?? "-"}
                </span>
                <span className="truncate">
                  <span className="opacity-70">Status:</span>{" "}
                  {v.kaiStatus ?? "-"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table or virtual list for large datasets */}
      <div className="hidden md:block mt-3">
        {useTable ? (
          <table className="table table-zebra table-auto w-full">
            <thead className="sticky top-0 z-10 bg-base-200">{headerRow}</thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="w-10">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={!!selected[v.id]}
                      onChange={() => toggleSelect(v)}
                      aria-label={`Select ${v.id}`}
                    />
                  </td>
                  <td className="w-[140px] whitespace-nowrap">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => nav(`/vuln/${encodeURIComponent(v.id)}`)}
                      aria-label={`Open details for ${v.id}`}
                    >
                      {v.id}
                    </button>
                  </td>
                  <td className="align-middle">
                    <div className="truncate max-w-[260px] md:max-w-[420px]">{v.title}</div>
                  </td>
                  <td className="w-[90px]">
                    <SeverityBadge s={v.severity} />
                  </td>
                  <td className="hidden lg:table-cell w-[120px]">
                    {v.published?.slice(0, 10) ?? "-"}
                  </td>
                  <td className="hidden lg:table-cell w-[60px]">{v.cvss ?? "-"}</td>
                  <td className="hidden xl:table-cell w-[160px]">{v.kaiStatus ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            <div className="list-row font-semibold">
              <div className="w-10" />
              <div className="w-[140px] truncate cursor-pointer" onClick={() => setSort(nextSort(sort, 'id'))}>
                ID {sort?.key === 'id' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
              <div className="flex-1 min-w-0 truncate cursor-pointer" onClick={() => setSort(nextSort(sort, 'title'))}>
                Title {sort?.key === 'title' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
              <div className="w-[90px] cursor-pointer" onClick={() => setSort(nextSort(sort, 'severity'))}>
                Severity {sort?.key === 'severity' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
              <div className="hidden lg:block w-[120px] cursor-pointer" onClick={() => setSort(nextSort(sort, 'published'))}>
                Published {sort?.key === 'published' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
              <div className="hidden lg:block w-[60px] cursor-pointer" onClick={() => setSort(nextSort(sort, 'cvss'))}>
                CVSS {sort?.key === 'cvss' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
              <div className="hidden xl:block w-[160px] cursor-pointer" onClick={() => setSort(nextSort(sort, 'kaiStatus'))}>
                kaiStatus {sort?.key === 'kaiStatus' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </div>
            </div>
            <VirtualList
              items={rows}
              itemHeight={48}
              height={420}
              render={(v) => (
                <Row
                  key={v.id}
                  v={v}
                  selected={!!selected[v.id]}
                  onSelect={() => toggleSelect(v)}
                  onOpen={() => nav(`/vuln/${encodeURIComponent(v.id)}`)}
                />
              )}
            />
          </div>
        )}
      </div>
      <VulnCompareDrawer items={Object.values(selected)} />
    </div>
  );
}

function Controls({
  sort,
  setSortKey,
  toggleSortDir,
  SORT_KEYS,
  PageSizeControl,
  pagesToShow,
  goto,
  page,
  pages,
  gotoInputEl,
  setPage,
}: {
  sort: SortSpec;
  setSortKey: (k: keyof Vulnerability) => void;
  toggleSortDir: () => void;
  SORT_KEYS: Array<{ key: keyof Vulnerability; label: string }>;
  PageSizeControl: React.ReactNode;
  pagesToShow: (number | "…")[];
  goto: (n: number) => void;
  page: number;
  pages: number;
  gotoInputEl: React.ReactNode;
  setPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="md:hidden flex items-center gap-2">
        <select
          className="select select-bordered select-sm"
          aria-label="Sort key"
          value={(sort?.key as string) || ""}
          onChange={(e) =>
            setSortKey(e.target.value as keyof Vulnerability)
          }
        >
          <option value="" disabled>Sort by…</option>
          {SORT_KEYS.map((s) => (
            <option key={s.key as string} value={s.key as string}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm btn-ghost"
          onClick={toggleSortDir}
          disabled={!sort}
          aria-label="Toggle sort direction"
        >
          {sort?.dir === "desc" ? "Desc" : "Asc"}
        </button>
      </div>
      {PageSizeControl}
      <div className="flex items-center gap-1">
        <div className="join">
          <button className="btn btn-xs join-item" onClick={() => goto(0)} disabled={page === 0} aria-label="Go to first page">&laquo;</button>
          {pagesToShow.map((p, idx) =>
            p === '…' ? (
              <button key={`ellipsis-${idx}`} className="btn btn-xs join-item" disabled aria-label="Ellipsis">…</button>
            ) : (
              <button
                key={p}
                className={`btn btn-xs join-item ${p === page ? 'btn-active' : ''}`}
                onClick={() => goto(p as number)}
                aria-label={`Go to page ${(p as number) + 1}`}
              >
                {(p as number) + 1}
              </button>
            )
          )}
          <button className="btn btn-xs join-item" onClick={() => goto(pages - 1)} disabled={page >= pages - 1} aria-label="Go to last page">&raquo;</button>
        </div>
      </div>
      {gotoInputEl}
      <div className="hidden md:flex gap-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setPage(0)} disabled={page === 0}>First</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Prev</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Next</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setPage(pages - 1)} disabled={page >= pages - 1}>Last</button>
      </div>
    </div>
  );
}

// Memoize controls to avoid unnecessary re-renders
const ControlsMemo = React.memo(Controls);


function Row({
  v,
  selected,
  onSelect,
  onOpen,
}: {
  v: Vulnerability;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <>
      <div className="w-10">
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${v.id}`} />
      </div>
      <div className="w-[140px] truncate">
        <button className="btn btn-ghost btn-xs" onClick={onOpen} aria-label={`Open details for ${v.id}`}>{v.id}</button>
      </div>
      <div className="flex-1 min-w-0 truncate">{v.title}</div>
      <div className="w-[90px]"><SeverityBadge s={v.severity} /></div>
      <div className="hidden lg:block w-[120px]">{v.published?.slice(0, 10) ?? '-'}</div>
      <div className="hidden lg:block w-[60px]">{v.cvss ?? '-'}</div>
      <div className="hidden xl:block w-[160px]">{v.kaiStatus ?? '-'}</div>
    </>
  );
}

function SeverityBadge({ s }: { s: Vulnerability["severity"] }) {
  const cls =
    s === "critical"
      ? "sev-critical"
      : s === "high"
      ? "sev-high"
      : s === "medium"
      ? "sev-medium"
      : s === "low"
      ? "sev-low"
      : "";
  // Normalize badge footprint so all severities take the same width
  return (
    <span className={`badge ${cls} inline-flex items-center justify-center w-[72px] text-xs capitalize whitespace-nowrap`}>
      {s}
    </span>
  );
}

function nextSort(current: SortSpec, key: keyof Vulnerability) {
  if (!current || current.key !== key) return { key, dir: "asc" as const };
  if (current.dir === "asc") return { key, dir: "desc" as const };
  return undefined;
}
