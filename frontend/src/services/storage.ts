// localStorage может бросать исключения (приватный режим, заблокированные данные) — приложение должно работать и так.
const mem: Record<string, string> = {};

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? mem[key];
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return mem[key] ? (JSON.parse(mem[key]) as T) : fallback;
  }
}

export function writeStore(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  mem[key] = raw;
  try {
    localStorage.setItem(key, raw);
  } catch { /* остаётся в памяти до закрытия */ }
}
