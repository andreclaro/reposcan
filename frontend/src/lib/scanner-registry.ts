/**
 * Server-side helper that fetches scanner metadata from the Python backend.
 *
 * The backend's `GET /scanners` endpoint is the single source of truth for
 * scanner definitions (name, tool, description, defaultEnabled, order).
 *
 * This module provides a thin caching layer so the frontend never needs to
 * hardcode scanner metadata again.
 */

export type ScannerMeta = {
  key: string;
  name: string;
  tool: string;
  description: string;
  defaultEnabled: boolean;
  enabled: boolean;
  order: number;
};

const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedRegistry: ScannerMeta[] | null = null;
let cacheTimestamp = 0;

/**
 * Fetch the scanner registry from the backend.
 *
 * Results are cached in-memory for 60 s. On failure, stale cache is returned;
 * if no cache exists at all, an empty array is returned so callers degrade
 * gracefully.
 */
export async function getScannerRegistry(): Promise<ScannerMeta[]> {
  const now = Date.now();
  if (cachedRegistry && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  const base = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/scanners`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }

    const data = (await res.json()) as { scanners: ScannerMeta[] };
    cachedRegistry = data.scanners;
    cacheTimestamp = now;
    return cachedRegistry;
  } catch {
    // Return stale cache when available, otherwise empty array.
    if (cachedRegistry) return cachedRegistry;
    return [];
  }
}

/**
 * Return the set of valid scanner keys (for request validation).
 */
export async function getScannerKeys(): Promise<Set<string>> {
  const registry = await getScannerRegistry();
  return new Set(registry.map((s) => s.key));
}
