// Common JSON payload shapes encountered during ingestion
import type { VulnerabilityRaw } from './vuln';

export interface JSONPayload {
  vulnerabilities?: VulnerabilityRaw[];
  items?: VulnerabilityRaw[];
  data?: VulnerabilityRaw[];
}
