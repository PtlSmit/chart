import type { Vulnerability, VulnerabilityRaw, Severity } from '@/types/vuln';

const sevMap: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low'
};

function pickSeverity(input?: string | number | null | undefined): Severity {
  if (!input) return 'unknown';
  const s = String(input).toLowerCase();
  return sevMap[s] ?? 'unknown';
}

export function normalizeVuln(raw: VulnerabilityRaw): Vulnerability | null {
  // Heuristics to map common fields. Adjust as needed for provided JSON.
  const id = raw.cveId ?? raw.cve ?? raw.id ?? raw.VulnerabilityID;
  if (!id) return null;

  const title = (raw.title ?? raw.summary ?? raw.name ?? raw.packageName ?? id) as string;
  const description = raw.description ?? raw.desc;
  const severity = pickSeverity(raw.severity ?? raw.cvssSeverity ?? raw.baseSeverity);
  const published = raw.published ?? raw.publishedDate ?? raw.date;

  // riskFactors in some datasets is an object map (keys are the factors).
  let riskFactors: string[] | undefined;
  const rf = raw.riskFactors ?? raw.risk ?? raw.tags;
  if (Array.isArray(rf)) riskFactors = rf.map((x) => String(x));
  else if (rf && typeof rf === 'object' && !Array.isArray(rf)) riskFactors = Object.keys(rf as object);
  else if (typeof rf === 'string') riskFactors = rf.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  const kaiStatus = raw.kaiStatus ?? raw.aiStatus ?? raw.status;
  const cvss = raw.cvss ?? raw.cvssScore ?? raw.cvss_v3;
  const cwe = raw.cwe ?? raw.cweIds;
  const vendor = raw.vendor ?? raw.organization;
  const product = raw.product ?? raw.package;
  const source = raw.source ?? raw.provider;

  return {
    id: String(id),
    title: String(title),
    description,
    severity,
    published,
    riskFactors,
    kaiStatus,
    cvss,
    cwe,
    vendor,
    product,
    source,
    raw
  };
}

export function monthKey(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
