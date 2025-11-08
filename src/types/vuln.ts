export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface VulnerabilityRaw {
  // Raw JSON may include many fields; we keep it open
  [k: string]: unknown;
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

