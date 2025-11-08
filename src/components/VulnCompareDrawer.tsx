import React, { useMemo, useState } from 'react';
import type { Vulnerability } from '@/types/vuln';

export default function VulnCompareDrawer({ items }: { items: Vulnerability[] }) {
  const [open, setOpen] = useState(false);
  const keys = useMemo(() => ['severity', 'cvss', 'published', 'vendor', 'product', 'kaiStatus'] as const, []);
  if (!items.length) return null;

  return (
    <div className="panel">
      <div className="controls">
        <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'} Comparison ({items.length})</button>
      </div>
      {open && (
        <div className="grid cols-3">
          {items.map((v) => (
            <div key={v.id} className="panel">
              <div style={{ fontWeight: 600 }}>{v.id}</div>
              <div className="tiny">{v.title}</div>
              <div style={{ marginTop: '.5rem' }}>
                {keys.map((k) => (
                  <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="hint">{k}</div>
                    <div>{String(v[k] ?? '-') }</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

