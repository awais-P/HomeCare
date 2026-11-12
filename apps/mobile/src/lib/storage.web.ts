// Web build: browsers already provide localStorage, so no SQLite polyfill is needed.
// (Native builds use storage.ts, which installs a SQLite-backed localStorage.)

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage is a convenience (language, cached profile); never crash the app over it.
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeItem(key, value === null ? null : JSON.stringify(value));
}
