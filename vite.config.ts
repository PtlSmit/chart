import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { normalizeVuln, monthKey } from "./src/data/normalize";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "mock-api-v1",
      configureServer(server) {
        let cache: any[] | null = null;
        // Filters an array of vulnerabilities based on query parameters.
        // Supports filtering by text query, severity, risk factors, excluded Kai status, and date ranges.
        const applyFilters = (arr: any[], q: any) => {
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
        // Supports numeric and string comparisons.
        const sortItems = (arr: any[], key?: string, dir?: string) => {
          if (!key) return arr; // If no key is provided, return the array as is.
          const d = dir === "desc" ? -1 : 1; // Determine sort direction multiplier.
          return arr.slice().sort((a, b) => {
            const av = a[key as any];
            const bv = b[key as any];
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
        // Returns counts for severity, risk factors, published by month, and Kai status.
        const summarize = (arr: any[]) => {
          const severityCounts: any = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
          };
          const riskFactorCounts: any = {};
          const publishedByMonth: any = {};
          const kaiStatusCounts: any = {};
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
        const loadData = (): any[] => {
          if (cache) return cache;
          const p = path.join(process.cwd(), "public", "uiDemoData.json");
          if (!fs.existsSync(p)) {
            cache = [];
            return cache;
          }
          const raw = fs.readFileSync(p, "utf8");
          let parsed: any = [];
          try {
            const obj = JSON.parse(raw);
            if (Array.isArray(obj)) {
              parsed = obj;
            } else if (obj && typeof obj === 'object') {
              // Traverse nested objects and collect any `vulnerabilities` arrays
              const acc: any[] = [];
              const visit = (node: any) => {
                if (!node) return;
                if (Array.isArray(node)) { for (const it of node) visit(it); return; }
                if (typeof node !== 'object') return;
                for (const [k, v] of Object.entries(node)) {
                  if (Array.isArray(v) && k.toLowerCase() === 'vulnerabilities') acc.push(...v);
                  else visit(v as any);
                }
              };
              visit(obj);
              parsed = acc;
            }
          } catch {
            parsed = raw
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                try { return JSON.parse(l); } catch { return null; }
              })
              .filter(Boolean);
          }
          cache = parsed
            .map((r: any) => normalizeVuln(r))
            .filter(Boolean) as any[];
          return cache;
        };

        server.middlewares.use("/api/v1/summary", (req, res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const data = loadData();
          res.end(JSON.stringify(summarize(data)));
        });

        server.middlewares.use("/api/v1/vulns", (req, res, next) => {
          const pathname = new URL((req as any).originalUrl || req.url!, "http://localhost").pathname;
          // Delegate /api/v1/vulns/:id to the next handler
          if (pathname !== "/api/v1/vulns") return next();
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const url = new URL((req as any).originalUrl || req.url!, "http://localhost");
          const q = Object.fromEntries(url.searchParams.entries());
          const offset = Number(q.offset || 0);
          const limit = Number(q.limit || 50);
          const key = q.sortKey as string | undefined;
          const dir = q.sortDir as string | undefined;
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
