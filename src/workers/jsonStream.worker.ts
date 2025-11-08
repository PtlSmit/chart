/// <reference lib="webworker" />
// Streaming JSON array parser worker. Accepts a URL to fetch.
// Posts messages { type: 'progress'|'items'|'done'|'error', ... }

import { normalizeVuln } from "@/data/normalize";
import type { Vulnerability, VulnerabilityRaw } from "@/types/vuln";
import type { JSONPayload } from "@/types/ingest";
import type { WorkerInMsg as InMsg, WorkerOutMsg as OutMsg } from "@/types/worker";

// JSONPayload type moved to src/types/ingest.ts

const ctx = self as DedicatedWorkerGlobalScope;

let emittedCount = 0;

ctx.onmessage = async (ev: MessageEvent<InMsg>) => {
  try {
    // Reset per load
    emittedCount = 0;
    await streamParse(await fetch(ev.data.url));
    ctx.postMessage({ type: "done" } satisfies OutMsg);
  } catch (e) {
    ctx.postMessage({
      type: "error",
      error: String((e as Error)?.message || e),
    } satisfies OutMsg);
  }
};

async function streamParse(resp: Response) {
  if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
  const len = Number(resp.headers.get("content-length") || 0);
  ctx.postMessage({
    type: "log",
    message: `Fetch started. status=${resp.status} length=${len}`,
  } satisfies OutMsg);
  // Streaming path
  if (resp.body) {
    let read = 0;
    const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        read += value.length;
        ctx.postMessage({ type: "progress", bytes: read } satisfies OutMsg);
        chunks.push(value);
      }
    }
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(ch);
        c.close();
      },
    });
    ctx.postMessage({
      type: "log",
      message: `Streaming read complete. bytes=${read}`,
    } satisfies OutMsg);
    await parseStream(stream);
    // If nothing emitted (e.g., non-array JSON), try structured fallback using full text
    if (emittedCount === 0) {
      const dec = new TextDecoder();
      let text = "";
      for (const ch of chunks) text += dec.decode(ch, { stream: true });
      text += dec.decode();
      await tryParseNonArrayPayload(text);
    }
    return;
  }
  // Fallback path: no streaming body, use arrayBuffer
  ctx.postMessage({
    type: "log",
    message: "No streaming body; falling back to arrayBuffer()",
  } satisfies OutMsg);
  const ab = await resp.arrayBuffer();
  ctx.postMessage({ type: "progress", bytes: ab.byteLength } satisfies OutMsg);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      // push in 1MB slices to keep decoder happy
      const CHUNK = 1 << 20;
      for (let i = 0; i < ab.byteLength; i += CHUNK) {
        c.enqueue(
          new Uint8Array(ab.slice(i, Math.min(ab.byteLength, i + CHUNK)))
        );
      }
      c.close();
    },
  });
  await parseStream(stream);
  if (emittedCount === 0) {
    const dec = new TextDecoder();
    const text = dec.decode(ab);
    await tryParseNonArrayPayload(text);
  }
}

async function parseStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buf = "";
  let inString = false;
  let escape = false;
  let arrayDepth = 0; // how many nested [ ... ] we are in
  let objDepth = 0; // nesting of { ... } while inside any array
  let itemStart = -1; // index in buf for current object start
  const batch: Vulnerability[] = [];
  const BATCH_SIZE = 500;

  const flushBatch = () => {
    if (!batch.length) return;
    const items = batch.splice(0);
    emittedCount += items.length;
    ctx.postMessage({ type: "items", items } satisfies OutMsg);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    if (done) buf += decoder.decode();

    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "[") {
        arrayDepth++;
        continue;
      }
      if (ch === "]") {
        arrayDepth = Math.max(0, arrayDepth - 1);
        continue;
      }

      if (arrayDepth > 0) {
        if (ch === "{") {
          if (objDepth === 0) itemStart = i;
          objDepth++;
          continue;
        }
        if (ch === "}") {
          if (objDepth > 0) objDepth--;
          if (objDepth === 0 && itemStart !== -1) {
            const objText = buf.slice(itemStart, i + 1);
            itemStart = -1;
            try {
              const raw = JSON.parse(objText) as VulnerabilityRaw;
              const norm = normalizeVuln(raw);
              if (norm) batch.push(norm);
              if (batch.length >= BATCH_SIZE) flushBatch();
            } catch {
              // ignore malformed entries
            }
          }
          continue;
        }
      }
    }

    // Trim processed prefix to keep buffer small when not in middle of an object
    if (itemStart === -1 && buf.length > 1_000_000) {
      buf = buf.slice(-500_000);
    }

    if (done) break;
  }
  flushBatch();
}

async function tryParseNonArrayPayload(text: string) {
  // Handle common non-array formats: object with array field, or NDJSON
  try {
    const parsed = JSON.parse(text) as JSONPayload | VulnerabilityRaw[];
    const obj = parsed as JSONPayload | VulnerabilityRaw[];
    const candidates: VulnerabilityRaw[] = Array.isArray(obj)
      ? (obj as VulnerabilityRaw[])
      : Array.isArray((obj as JSONPayload)?.vulnerabilities)
      ? ((obj as JSONPayload).vulnerabilities! as VulnerabilityRaw[])
      : Array.isArray((obj as JSONPayload)?.items)
      ? ((obj as JSONPayload).items! as VulnerabilityRaw[])
      : Array.isArray((obj as JSONPayload)?.data)
      ? ((obj as JSONPayload).data! as VulnerabilityRaw[])
      : [];
    if (Array.isArray(candidates) && candidates.length) {
      const batch: Vulnerability[] = [];
      const BATCH_SIZE = 500;
      for (const raw of candidates) {
        try {
          const norm = normalizeVuln(raw);
          if (norm) batch.push(norm);
          if (batch.length >= BATCH_SIZE) {
            emittedCount += batch.length;
            ctx.postMessage({
              type: "items",
              items: batch.splice(0),
            } satisfies OutMsg);
          }
        } catch (err) {
          // Log once per 5k skipped entries to avoid log spam
          if ((emittedCount + batch.length) % 5000 === 0) {
            ctx.postMessage({
              type: "log",
              message: `Skipping malformed entry in object payload: ${String((err as Error)?.message || err)}`,
            } satisfies OutMsg);
          }
        }
      }
      if (batch.length) {
        emittedCount += batch.length;
        ctx.postMessage({
          type: "items",
          items: batch.splice(0),
        } satisfies OutMsg);
      }
      ctx.postMessage({
        type: "log",
        message: "Parsed non-array JSON payload successfully",
      } satisfies OutMsg);
      return;
    }
  } catch (err) {
    ctx.postMessage({
      type: "log",
      message: `Parsing as object/array failed; will try NDJSON. ${String((err as Error)?.message || err)}`,
    } satisfies OutMsg);
  }

  // NDJSON: one JSON object per line
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return;
  const batch: Vulnerability[] = [];
  const BATCH_SIZE = 500;
  let ndjsonParsed = 0;
  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as VulnerabilityRaw;
      const norm = normalizeVuln(raw);
      if (norm) batch.push(norm);
      if (batch.length >= BATCH_SIZE) {
        emittedCount += batch.length;
        ctx.postMessage({
          type: "items",
          items: batch.splice(0),
        } satisfies OutMsg);
      }
      ndjsonParsed++;
    } catch (err) {
      // Ignore malformed lines, but log occasionally to aid debugging
      if (ndjsonParsed % 2000 === 0) {
        ctx.postMessage({
          type: "log",
          message: `NDJSON line parse error: ${String((err as Error)?.message || err)}`,
        } satisfies OutMsg);
      }
    }
  }
  if (batch.length) {
    emittedCount += batch.length;
    ctx.postMessage({ type: "items", items: batch.splice(0) } satisfies OutMsg);
  }
  ctx.postMessage({
    type: "log",
    message: `Parsed NDJSON payload successfully (objects: ${ndjsonParsed})`,
  } satisfies OutMsg);
}

export {}; // ensure module
