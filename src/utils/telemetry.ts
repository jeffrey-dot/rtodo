type Series = { values: number[]; count: number };

const series: Record<string, Series> = {};
const MAX_VALUES = 200;
const LOG_EVERY = 20;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function recordLatency(name: string, ms: number) {
  if (!series[name]) series[name] = { values: [], count: 0 };
  const s = series[name];
  s.values.push(ms);
  if (s.values.length > MAX_VALUES) s.values.shift();
  s.count++;
  if (s.count % LOG_EVERY === 0) {
    const p95 = percentile(s.values, 95);
    // eslint-disable-next-line no-console
    console.log(`[telemetry] ${name}: p95=${p95.toFixed(1)}ms over ${s.values.length} samples`);
  }
}

export async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const res = await fn();
    return res;
  } finally {
    const elapsed = performance.now() - start;
    recordLatency(name, elapsed);
  }
}
