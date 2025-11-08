import fs from 'node:fs';

const path = process.argv[2] || 'public/uiDemoData.json';
const rs = fs.createReadStream(path, { encoding: 'utf8' });

let buf = '';
let inString = false;
let escape = false;
let arrayDepth = 0;
let objDepth = 0;
let itemStart = -1;
let count = 0;

rs.on('data', (chunk) => {
  buf += chunk;
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
      if (ch === '{') { if (objDepth === 0) itemStart = i; objDepth++; continue; }
      if (ch === '}') {
        if (objDepth > 0) objDepth--;
        if (objDepth === 0 && itemStart !== -1) {
          const objText = buf.slice(itemStart, i + 1);
          itemStart = -1;
          try {
            JSON.parse(objText);
            count++;
          } catch {}
        }
        continue;
      }
    }
  }
  if (itemStart === -1 && buf.length > 2_000_000) buf = buf.slice(-1_000_000);
  process.stdout.write(`\rParsed objects: ${count.toLocaleString()}`);
});

rs.on('end', () => {
  console.log(`\nDone. Total objects parsed in arrays: ${count.toLocaleString()}`);
});

