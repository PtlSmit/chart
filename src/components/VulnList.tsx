import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/context/DataContext";
import { VirtualList } from "@/utils/virtualize";
import type { Vulnerability } from "@/types/vuln";
import type { SortSpec } from "@/types/common";
import VulnCompareDrawer from "@/components/VulnCompareDrawer";

export default function VulnList() {
  const { results, total, page, pageSize, setPage, setSort, sort } = useData();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // initialize
    setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
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

  const headers: { key: keyof Vulnerability; label: string; width: number }[] =
    [
      { key: "id", label: "ID", width: 200 },
      { key: "title", label: "Title", width: 420 },
      { key: "severity", label: "Severity", width: 120 },
      { key: "published", label: "Published", width: 160 },
      { key: "cvss", label: "CVSS", width: 80 },
      { key: "kaiStatus", label: "kaiStatus", width: 200 },
    ];

  const headerRow = (
    <tr>
      <th className="w-10"></th>
      {headers.map((h) => (
        <th key={h.key as string} style={{ width: h.width }}>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setSort(nextSort(sort, h.key))}
          >
            {h.label}{" "}
            {sort?.key === h.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
          </button>
        </th>
      ))}
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

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <div>
          <strong>{total.toLocaleString()}</strong> results • Page {page + 1} /{" "}
          {pages}
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setPage(Math.min(pages - 1, page + 1))}
            disabled={page >= pages - 1}
          >
            Next
          </button>
        </div>
      </div>

      {/* Mobile: stacked cards for best readability */}
      {isMobile && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              className="select select-bordered select-sm"
              value={(sort?.key as string) || "id"}
              onChange={(e) =>
                setSortKey(e.target.value as keyof Vulnerability)
              }
            >
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
            >
              {sort?.dir === "desc" ? "Desc" : "Asc"}
            </button>
          </div>
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
                    />
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => nav(`/vuln/${encodeURIComponent(v.id)}`)}
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
      )}

      {/* Desktop: table or virtual list for large datasets */}
      {!isMobile && (
        <div className="overflow-x-auto mt-3">
          {useTable ? (
            <table className="table table-zebra table-auto w-full">
              <thead>{headerRow}</thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="w-10">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={!!selected[v.id]}
                        onChange={() => toggleSelect(v)}
                      />
                    </td>
                    <td className="w-[200px]">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => nav(`/vuln/${encodeURIComponent(v.id)}`)}
                      >
                        {v.id}
                      </button>
                    </td>
                    <td className="max-w-[420px] truncate">{v.title}</td>
                    <td className="w-[120px]">
                      <SeverityBadge s={v.severity} />
                    </td>
                    <td className="w-[160px]">
                      {v.published?.slice(0, 10) ?? "-"}
                    </td>
                    <td className="w-[80px]">{v.cvss ?? "-"}</td>
                    <td className="w-[200px]">{v.kaiStatus ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>
              <div className="list-row" style={{ fontWeight: 600 }}>
                <div style={{ width: 40 }} />
                {headers.map((h) => (
                  <div
                    key={h.key as string}
                    style={{ width: h.width, cursor: "pointer" }}
                    onClick={() => setSort(nextSort(sort, h.key))}
                  >
                    {h.label}{" "}
                    {sort?.key === h.key
                      ? sort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : ""}
                  </div>
                ))}
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
      )}
      <VulnCompareDrawer items={Object.values(selected)} />
    </div>
  );
}

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
      <div style={{ width: 40 }}>
        <input type="checkbox" checked={selected} onChange={onSelect} />
      </div>
      <div style={{ width: 200 }}>
        <button className="btn btn-ghost btn-xs" onClick={onOpen}>
          {v.id}
        </button>
      </div>
      <div
        style={{
          width: 420,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {v.title}
      </div>
      <div style={{ width: 120 }}>
        <SeverityBadge s={v.severity} />
      </div>
      <div style={{ width: 160 }}>{v.published?.slice(0, 10) ?? "-"}</div>
      <div style={{ width: 80 }}>{v.cvss ?? "-"}</div>
      <div style={{ width: 200 }}>{v.kaiStatus ?? "-"}</div>
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
  return <span className={`badge ${cls}`}>{s}</span>;
}

function nextSort(current: SortSpec, key: keyof Vulnerability) {
  if (!current || current.key !== key) return { key, dir: "asc" as const };
  if (current.dir === "asc") return { key, dir: "desc" as const };
  return undefined;
}
