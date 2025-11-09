import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import type { Vulnerability } from '@/types/vuln';
import { getDefaultVulnsEndpoint } from '@/services/dataService';

export default function VulnDetail() {
  const { id } = useParams();
  const { repo } = useData();
  const [v, setV] = useState<Vulnerability | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      // Prefer direct API lookup by id; fallback to repository query if needed
      try {
        const base = getDefaultVulnsEndpoint().replace(/\/?vulns\/?$/, '');
        const resp = await fetch(`${base}/vulns/${encodeURIComponent(id)}`);
        if (resp.ok) {
          const item = (await resp.json()) as Vulnerability;
          if (mounted) setV(item);
          return;
        }
      } catch {}
      // Fallback: query via repo
      if (repo) {
        const res = await repo.query({ query: id, severity: new Set(), riskFactors: new Set(), kaiStatusExclude: new Set() }, 0, 1);
        if (mounted) setV(res[0] ?? null);
      }
    })();
    return () => { mounted = false; };
  }, [repo, id]);

  if (!v) return <div className="panel">Loading… <Link to="/">Back</Link></div>;

  return (
    <div className="col">
      <div className="panel">
        <div className="controls" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{v.id}</div>
            <div className="tiny">{v.title}</div>
          </div>
          <Link to="/"><button className="ghost">Back</button></Link>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="panel">
          <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Details</div>
          <dl>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">Severity</dt><dd>{v.severity}</dd></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">CVSS</dt><dd>{v.cvss ?? '-'}</dd></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">Published</dt><dd>{v.published ?? '-'}</dd></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">kaiStatus</dt><dd>{v.kaiStatus ?? '-'}</dd></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">Vendor</dt><dd>{v.vendor ?? '-'}</dd></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><dt className="hint">Product</dt><dd>{v.product ?? '-'}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Description</div>
          <div className="tiny" style={{ whiteSpace: 'pre-wrap' }}>{v.description ?? '-'}</div>
        </div>
      </div>
      <div className="panel">
        <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Raw</div>
        <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(v.raw ?? {}, null, 2)}</pre>
      </div>
    </div>
  );
}
