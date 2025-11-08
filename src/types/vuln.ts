export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

// Raw JSON shape from various sources. Enumerates common fields the normalizer reads.
export interface VulnerabilityRaw {
  // identifiers
  cveId?: string;
  cve?: string;
  id?: string;
  VulnerabilityID?: string;

  // titles/descriptions
  title?: string;
  summary?: string;
  name?: string;
  packageName?: string;
  description?: string;
  desc?: string;

  // severity-related
  severity?: string; // string form
  cvssSeverity?: string;
  baseSeverity?: string;
  cvss?: number;
  cvssScore?: number;
  cvss_v3?: number;

  // dates
  published?: string; // ISO
  publishedDate?: string; // ISO
  date?: string; // ISO

  // tags and risk factors
  riskFactors?: string[] | Record<string, string | number | boolean | null | undefined> | string;
  risk?: string[] | Record<string, string | number | boolean | null | undefined> | string;
  tags?: string[] | Record<string, string | number | boolean | null | undefined> | string;

  // status
  kaiStatus?: string;
  aiStatus?: string;
  status?: string;

  // CWE and meta
  cwe?: string[];
  cweIds?: string[];
  vendor?: string;
  organization?: string;
  product?: string;
  package?: string;
  source?: string;
  provider?: string;
}

export interface Vulnerability {
  id: string; // CVE or unique id
  title: string;
  description?: string;
  severity: Severity;
  published?: string; // ISO date
  riskFactors?: string[];
  kaiStatus?: string; // e.g. "invalid - norisk" | "ai-invalid-norisk"
  cvss?: number;
  cwe?: string[];
  vendor?: string;
  product?: string;
  source?: string;
  raw?: VulnerabilityRaw;
}

export interface SummaryMetrics {
  total: number;
  severityCounts: Record<Severity | 'unknown', number>;
  riskFactorCounts: Record<string, number>;
  publishedByMonth: Record<string, number>; // YYYY-MM -> count
  kaiStatusCounts: Record<string, number>;
}

export interface Filters {
  query: string;
  severity: Set<Severity>;
  riskFactors: Set<string>;
  kaiStatusExclude: Set<string>; // statuses to exclude
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
}

export interface Preferences {
  darkMode: boolean;
  pageSize: number;
  defaultExcludeKai: boolean;
}
