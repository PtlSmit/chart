// Lightweight production-like API server
// Endpoints:
//  GET /api/v1/vulns?offset&limit&query&severity&riskFactors&kaiStatusExclude&dateFrom&dateTo&sortKey&sortDir
//  GET /api/v1/vulns/:id
//  GET /api/v1/summary

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const API_BASE = (process.env.API_BASE || '/api/v1').replace(/\/$/, '');
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'public', 'uiDemoData.json');

// Utilities mirroring src/data/normalize.ts (duplicated here for runtime)
const sevMap = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
function pickSeverity(input) {
  if (input == null) return 'unknown';
  const s = String(input).toLowerCase();
  return sevMap[s] || 'unknown';
}
function monthKey(iso) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function normalizeVuln(raw) {
  const id = raw?.cveId ?? raw?.cve ?? raw?.id ?? raw?.VulnerabilityID;
  if (!id) return null;
  const title = raw?.title ?? raw?.summary ?? raw?.name ?? raw?.packageName ?? id;
  const description = raw?.description ?? raw?.desc;
  const severity = pickSeverity(raw?.severity ?? raw?.cvssSeverity ?? raw?.baseSeverity);
  const published = raw?.published ?? raw?.publishedDate ?? raw?.date;

  let riskFactors;
  const rf = raw?.riskFactors ?? raw?.risk ?? raw?.tags;
  if (Array.isArray(rf)) riskFactors = rf.map((x) => String(x));
  else if (rf && typeof rf === 'object') riskFactors = Object.keys(rf);
  else if (typeof rf === 'string') riskFactors = rf.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  const kaiStatus = raw?.kaiStatus ?? raw?.aiStatus ?? raw?.status;
  const cvss = raw?.cvss ?? raw?.cvssScore ?? raw?.cvss_v3;
  const cwe = raw?.cwe ?? raw?.cweIds;
  const vendor = raw?.vendor ?? raw?.organization;
  const product = raw?.product ?? raw?.package;
  const source = raw?.source ?? raw?.provider;
  return { id: String(id), title: String(title), description, severity, published, riskFactors, kaiStatus, cvss, cwe, vendor, product, source, raw };
}

// Load + normalize data once and cache in memory
let DATA_CACHE = [];
function collectVulns(obj) {
  const acc = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { for (const it of node) visit(it); return; }
    if (typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && k.toLowerCase() === 'vulnerabilities') acc.push(...v);
      else visit(v);
    }
  };
  visit(obj);
  return acc;
}
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    let parsed = [];
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) parsed = obj;
      else if (obj && typeof obj === 'object') parsed = collectVulns(obj);
    } catch {
      parsed = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }
    DATA_CACHE = parsed.map((r) => normalizeVuln(r)).filter(Boolean);
    console.log(`[server] Loaded ${DATA_CACHE.length} vulnerabilities from ${DATA_FILE}`);
  } catch (e) {
    console.warn(`[server] Failed to load data file ${DATA_FILE}: ${e?.message || e}`);
    DATA_CACHE = [];
  }
}
loadData();

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const applyFilters = (arr, q) => {
  const query = String(q.query ?? '').trim().toLowerCase();
  const sev = new Set(String(q.severity || '').split(',').filter(Boolean));
  const rf = new Set(String(q.riskFactors || '').split(',').filter(Boolean));
  const kx = new Set(String(q.kaiStatusExclude || '').split(',').filter(Boolean));
  const df = q.dateFrom ? Date.parse(q.dateFrom) : undefined;
  const dt = q.dateTo ? Date.parse(q.dateTo) : undefined;
  return arr.filter((v) => {
    if (sev.size && !sev.has(v.severity)) return false;
    if (rf.size && !(v.riskFactors || []).some((r) => rf.has(r))) return false;
    if (v.kaiStatus && kx.has(v.kaiStatus)) return false;
    if (df || dt) {
      const t = v.published ? Date.parse(v.published) : undefined;
      if (df && (!t || t < df)) return false;
      if (dt && (!t || t > dt)) return false;
    }
    if (query) {
      const hay = `${v.id} ${v.title} ${v.description ?? ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
};
const sortItems = (arr, key, dir) => {
  if (!key) return arr;
  const d = dir === 'desc' ? -1 : 1;
  return arr.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * d;
    const as = av == null ? '' : String(av);
    const bs = bv == null ? '' : String(bv);
    if (as < bs) return -1 * d;
    if (as > bs) return 1 * d;
    return 0;
  });
};
const summarize = (arr) => {
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const riskFactorCounts = {};
  const publishedByMonth = {};
  const kaiStatusCounts = {};
  for (const v of arr) {
    const sev = v.severity ?? 'unknown';
    severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
    if (v.riskFactors) for (const r of v.riskFactors) riskFactorCounts[r] = (riskFactorCounts[r] ?? 0) + 1;
    const mk = monthKey(v.published);
    if (mk) publishedByMonth[mk] = (publishedByMonth[mk] ?? 0) + 1;
    const ks = v.kaiStatus ?? 'unknown';
    kaiStatusCounts[ks] = (kaiStatusCounts[ks] ?? 0) + 1;
  }
  return { total: arr.length, severityCounts, riskFactorCounts, publishedByMonth, kaiStatusCounts };
};

// Routes
app.get(`${API_BASE}/summary`, (_req, res) => {
  res.json(summarize(DATA_CACHE));
});

app.get(`${API_BASE}/vulns/:id`, (req, res) => {
  const id = req.params.id;
  const found = DATA_CACHE.find((v) => v.id === id);
  if (!found) return res.status(404).json({ error: 'not found' });
  res.json(found);
});

app.get(`${API_BASE}/vulns`, (req, res) => {
  const { offset = '0', limit = '50', sortKey, sortDir } = req.query;
  const off = Number(offset) || 0;
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 1000);
  const filtered = applyFilters(DATA_CACHE, req.query);
  const total = filtered.length;
  const sorted = sortItems(filtered, sortKey, sortDir);
  const results = sorted.slice(off, off + lim);
  res.json({ total, results });
});

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}${API_BASE}`);
});

