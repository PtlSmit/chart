/// <reference lib="webworker" />
// Streaming JSON array parser worker. Accepts either a URL to fetch or a File via transferable.
// Posts messages { type: 'progress'|'items'|'done'|'error', ... }

import { normalizeVuln } from '@/data/normalize';
import type { Vulnerability } from '@/types/vuln';

type InMsg =
  | { type: 'fetch'; url: string }
  | { type: 'file'; file: File };

type OutMsg =
  | { type: 'progress'; bytes: number }
  | { type: 'items'; items: Vulnerability[] }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'log'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let emittedCount = 0;

ctx.onmessage = async (ev: MessageEvent<InMsg>) => {
  try {
    if (ev.data.type === 'fetch') {
      await streamParse(await fetch(ev.data.url));
    } else if (ev.data.type === 'file') {
      const file = ev.data.file;
      // Prefer streaming if available; fallback to arrayBuffer/text for broader browser support
      try {
        const rs = (file as any).stream?.();
        if (rs) {
          await parseStream(rs as ReadableStream<Uint8Array>);
        } else {
          await parseBlobFallback(file);
        }
      } catch {
        // Some browsers don't support Blob.stream()
        await parseBlobFallback(file);
      }
      // If nothing emitted (e.g., non-array JSON), try structured fallbacks
      if (emittedCount === 0) {
        try {
          const text = await (file as any).text?.();
          if (typeof text === 'string' && text.length) {
            await tryParseNonArrayPayload(text);
          }
        } catch {/* ignore */}
      }
    }
    ctx.postMessage({ type: 'done' } satisfies OutMsg);
  } catch (e: any) {
    ctx.postMessage({ type: 'error', error: String(e?.message || e) } satisfies OutMsg);
  }
};

async function streamParse(resp: Response) {
  if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
  const len = Number(resp.headers.get('content-length') || 0);
  ctx.postMessage({ type: 'log', message: `Fetch started. status=${resp.status} length=${len}` } satisfies OutMsg);
  // Streaming path
  if (resp.body && (resp.body as any).getReader) {
    let read = 0;
    const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        read += value.length;
        ctx.postMessage({ type: 'progress', bytes: read } satisfies OutMsg);
        chunks.push(value);
      }
    }
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(ch);
        c.close();
      }
    });
    ctx.postMessage({ type: 'log', message: `Streaming read complete. bytes=${read}` } satisfies OutMsg);
    await parseStream(stream);
    return;
  }
  // Fallback path: no streaming body, use arrayBuffer
  ctx.postMessage({ type: 'log', message: 'No streaming body; falling back to arrayBuffer()' } satisfies OutMsg);
  const ab = await resp.arrayBuffer();
  ctx.postMessage({ type: 'progress', bytes: ab.byteLength } satisfies OutMsg);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      // push in 1MB slices to keep decoder happy
      const CHUNK = 1 << 20;
      for (let i = 0; i < ab.byteLength; i += CHUNK) {
        c.enqueue(new Uint8Array(ab.slice(i, Math.min(ab.byteLength, i + CHUNK))));
      }
      c.close();
    }
  });
  await parseStream(stream);
}

async function parseStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buf = '';
  let inString = false;
  let escape = false;
  let arrayDepth = 0; // how many nested [ ... ] we are in
  let objDepth = 0;   // nesting of { ... } while inside any array
  let itemStart = -1; // index in buf for current object start
  const batch: Vulnerability[] = [];
  const BATCH_SIZE = 500;

  const flushBatch = () => {
    if (!batch.length) return;
    const items = batch.splice(0);
    emittedCount += items.length;
    ctx.postMessage({ type: 'items', items } satisfies OutMsg);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    if (done) buf += decoder.decode();

    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i];

      if (inString) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = false; }
        continue;
      }

      if (ch === '"') { inString = true; continue; }

      if (ch === '[') { arrayDepth++; continue; }
      if (ch === ']') { arrayDepth = Math.max(0, arrayDepth - 1); continue; }

      if (arrayDepth > 0) {
        if (ch === '{') {
          if (objDepth === 0) itemStart = i;
          objDepth++;
          continue;
        }
        if (ch === '}') {
          if (objDepth > 0) objDepth--;
          if (objDepth === 0 && itemStart !== -1) {
            const objText = buf.slice(itemStart, i + 1);
            itemStart = -1;
            try {
              const raw = JSON.parse(objText);
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

async function parseBlobFallback(file: Blob) {
  // Fallback path: read the whole file and feed in manageable chunks
  ctx.postMessage({ type: 'log', message: 'Using Blob fallback (no stream())' } satisfies OutMsg);
  const ab = await (file as any).arrayBuffer?.();
  if (!ab) throw new Error('Unable to read file');
  ctx.postMessage({ type: 'progress', bytes: (ab as ArrayBuffer).byteLength } satisfies OutMsg);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      const buf = new Uint8Array(ab as ArrayBuffer);
      const CHUNK = 1 << 20;
      for (let i = 0; i < buf.byteLength; i += CHUNK) {
        c.enqueue(buf.subarray(i, Math.min(buf.byteLength, i + CHUNK)));
      }
      c.close();
    }
  });
  await parseStream(stream);
}

async function tryParseNonArrayPayload(text: string) {
  // Handle common non-array formats: object with array field, or NDJSON
  try {
    const obj = JSON.parse(text);
    const candidates: any[] = Array.isArray(obj)
      ? obj
      : Array.isArray((obj as any)?.vulnerabilities)
      ? (obj as any).vulnerabilities
      : Array.isArray((obj as any)?.items)
      ? (obj as any).items
      : Array.isArray((obj as any)?.data)
      ? (obj as any).data
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
            ctx.postMessage({ type: 'items', items: batch.splice(0) } satisfies OutMsg);
          }
        } catch {/* ignore */}
      }
      if (batch.length) {
        emittedCount += batch.length;
        ctx.postMessage({ type: 'items', items: batch.splice(0) } satisfies OutMsg);
      }
      ctx.postMessage({ type: 'log', message: 'Parsed non-array JSON payload successfully' } satisfies OutMsg);
      return;
    }
  } catch {/* fall through to NDJSON */}

  // NDJSON: one JSON object per line
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  const batch: Vulnerability[] = [];
  const BATCH_SIZE = 500;
  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const norm = normalizeVuln(raw);
      if (norm) batch.push(norm);
      if (batch.length >= BATCH_SIZE) {
        emittedCount += batch.length;
        ctx.postMessage({ type: 'items', items: batch.splice(0) } satisfies OutMsg);
      }
    } catch {/* ignore malformed line */}
  }
  if (batch.length) {
    emittedCount += batch.length;
    ctx.postMessage({ type: 'items', items: batch.splice(0) } satisfies OutMsg);
  }
  ctx.postMessage({ type: 'log', message: 'Parsed NDJSON payload successfully' } satisfies OutMsg);
}

export {}; // ensure module
