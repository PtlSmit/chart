// Utilities for loading vulnerability data via Worker and endpoints

export function toFetchableUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const owner = parts[0];
      const repo = parts[1];
      const branch = parts[3];
      const rest = parts.slice(4).join('/');
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest}`;
    }
    return url;
  } catch {
    return url;
  }
}

export async function headExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export function startLoadFromUrl(worker: Worker, url: string) {
  const safe = toFetchableUrl(url);
  worker.postMessage({ type: 'fetch', url: safe });
  return safe;
}

export function startLoadFromFile(worker: Worker, file: File) {
  worker.postMessage({ type: 'file', file });
}

export function getDefaultVulnsEndpoint(): string {
  // Allows overriding via VITE_API_URL, defaults to dev mock endpoint
  return import.meta.env.VITE_API_URL || '/api/v1/vulns';
}
