import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { normalizeVuln, monthKey } from "./src/data/normalize";
import type { Vulnerability, Severity } from "./src/types/vuln";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "mock-api-v1",
      configureServer(server) {
        const ALLOWED_SORT_KEYS = new Set(['id', 'title', 'severity', 'published', 'cvss', 'kaiStatus', 'vendor', 'product', 'source']);
        let cache: Vulnerability[] | null = null;

        // Define a type for the raw vulnerability data to avoid using 'any'.
        type RawVulnerability = Record<string, unknown>;

        // Filters an array of vulnerabilities based on query parameters.
        const applyFilters = (arr: Vulnerability[], q: Record<string, string>) => {
          const query = String(q.query ?? "")
            .trim()
            .toLowerCase();
          const sev = new Set<string>(
            (q.severity ? String(q.severity).split(",") : []).filter(Boolean)
          );
          const rf = new Set<string>(
            (q.riskFactors ? String(q.riskFactors).split(",") : []).filter(
              Boolean
            )
          );
          const kx = new Set<string>(
            (q.kaiStatusExclude
              ? String(q.kaiStatusExclude).split(",")
              : []
            ).filter(Boolean)
          );
          const df = q.dateFrom ? Date.parse(q.dateFrom) : undefined;
          const dt = q.dateTo ? Date.parse(q.dateTo) : undefined;
          return arr.filter((v) => {
            // Filter by severity
            if (sev.size && !sev.has(v.severity)) return false;
            // Filter by risk factors
            if (
              rf.size &&
              !(v.riskFactors || []).some((r: string) => rf.has(r))
            )
              return false;
            // Filter by excluded Kai status
            if (v.kaiStatus && kx.has(v.kaiStatus)) return false;
            // Filter by published date range
            if (df || dt) {
              const t = v.published ? Date.parse(v.published) : undefined;
              if (df && (!t || t < df)) return false;
              if (dt && (!t || t > dt)) return false;
            }
            // Filter by text query (ID, title, description)
            if (query) {
              const hay = `${v.id} ${v.title} ${
                v.description ?? ""
              }`.toLowerCase();
              if (!hay.includes(query)) return false;
            }
            return true;
          });
        };
        // Sorts an array of items based on a given key and direction.
        const sortItems = (arr: Vulnerability[], key?: string, dir?: string) => {
          if (!key) return arr; // If no key is provided, return the array as is.
          const d = dir === "desc" ? -1 : 1; // Determine sort direction multiplier.
          return arr.slice().sort((a, b) => {
            const av = a[key as keyof Vulnerability];
            const bv = b[key as keyof Vulnerability];
            // Numeric comparison
            if (typeof av === "number" && typeof bv === "number")
              return (av - bv) * d;
            // String comparison
            const as = av == null ? "" : String(av);
            const bs = bv == null ? "" : String(bv);
            if (as < bs) return -1 * d;
            if (as > bs) return 1 * d;
            return 0;
          });
        };
        // Calculates summary metrics for a given array of vulnerabilities.
        const summarize = (arr: Vulnerability[]) => {
          const severityCounts: Record<Severity, number> = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
          };
          const riskFactorCounts: Record<string, number> = {};
          const publishedByMonth: Record<string, number> = {};
          const kaiStatusCounts: Record<string, number> = {};
          for (const v of arr) {
            const sev = v.severity ?? "unknown";
            severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
            if (v.riskFactors)
              for (const r of v.riskFactors)
                riskFactorCounts[r] = (riskFactorCounts[r] ?? 0) + 1;
            const mk = monthKey(v.published);
            if (mk) publishedByMonth[mk] = (publishedByMonth[mk] ?? 0) + 1;
            const ks = v.kaiStatus ?? "unknown";
            kaiStatusCounts[ks] = (kaiStatusCounts[ks] ?? 0) + 1;
          }
          const total = arr.length;
          return {
            total,
            severityCounts,
            riskFactorCounts,
            publishedByMonth,
            kaiStatusCounts,
          };
        };
        const loadData = (): Vulnerability[] => {
          if (cache) return cache;
          const p = path.join(process.cwd(), "public", "uiDemoData.json");
          if (!fs.existsSync(p)) {
            cache = [];
            return cache;
          }
          try {
            const raw = fs.readFileSync(p, "utf8");
            const parsed = JSON.parse(raw) as RawVulnerability[];
            cache = parsed
              .map((r) => normalizeVuln(r))
              .filter((v): v is Vulnerability => v !== null);
            return cache;
          } catch (e) {
            console.error(`[server] Failed to parse data file ${p}:`, e);
            cache = [];
            return cache;
          }
        };

        server.middlewares.use("/api/v1/summary", (req, res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const data = loadData();
          res.end(JSON.stringify(summarize(data)));
        });

        server.middlewares.use("/api/v1/vulns", (req, res, next) => {
          const pathname = new URL(req.originalUrl || req.url!, "http://localhost").pathname;
          // Delegate /api/v1/vulns/:id to the next handler
          if (pathname !== "/api/v1/vulns") return next();
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const url = new URL(req.originalUrl || req.url!, "http://localhost");
          const q = Object.fromEntries(url.searchParams.entries());
          const offset = Number(q.offset || 0);
          const limit = Number(q.limit || 50);
          const key = q.sortKey as string | undefined;
          const dir = q.sortDir as string | undefined;
          if (key && !ALLOWED_SORT_KEYS.has(key)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid sortKey', allowed: Array.from(ALLOWED_SORT_KEYS) }));
            return;
          }
          if (dir && !(dir === 'asc' || dir === 'desc')) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid sortDir', allowed: ['asc', 'desc'] }));
            return;
          }
          const data = loadData();
          const filtered = applyFilters(data, q);
          const total = filtered.length;
          const sorted = sortItems(filtered, key, dir);
          const slice = sorted.slice(offset, offset + limit);
          res.end(JSON.stringify({ total, results: slice }));
        });

        server.middlewares.use("/api/v1/vulns/", (req, res, next) => {
          if (!req.url) return next();
          const m = req.url.match(/^\/api\/v1\/vulns\/(.+)$/);
          if (!m) return next();
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const id = decodeURIComponent(m[1]);
          const data = loadData();
          const found = data.find((v) => v.id === id);
          if (!found) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "not found" }));
          } else {
            res.end(JSON.stringify(found));
          }
        });
      },
    },
  ],
  build: {
    target: "es2020",
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5173,
  },
});
