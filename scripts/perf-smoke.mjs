import {performance} from 'node:perf_hooks';

const baseUrl = process.env.PERF_BASE_URL ?? 'http://localhost:8000';
const path = process.env.PERF_PATH ?? '/stories?limit=20';
const total = Number.parseInt(process.env.PERF_REQUESTS ?? '100', 10);
const concurrency = Number.parseInt(process.env.PERF_CONCURRENCY ?? '10', 10);
const maxP95 = Number.parseInt(process.env.PERF_MAX_P95_MS ?? '500', 10);

for (const [name, value] of Object.entries({total, concurrency, maxP95})) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

const durations = [];
let next = 0;
let failures = 0;

async function worker() {
  while (next < total) {
    next++;
    const started = performance.now();
    try {
      const response = await fetch(new URL(path, baseUrl));
      if (!response.ok) failures++;
      await response.arrayBuffer();
    } catch {
      failures++;
    } finally {
      durations.push(performance.now() - started);
    }
  }
}

await Promise.all(
  Array.from({length: Math.min(concurrency, total)}, () => worker())
);
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.ceil(durations.length * p) - 1] ?? 0;
const result = {
  url: new URL(path, baseUrl).toString(),
  requests: total,
  concurrency,
  failures,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
};

console.log(JSON.stringify(result, null, 2));
if (failures > 0 || result.p95Ms > maxP95) process.exitCode = 1;
