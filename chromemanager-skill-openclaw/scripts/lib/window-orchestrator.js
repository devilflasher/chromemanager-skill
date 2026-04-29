import { setTimeout as delay } from 'node:timers/promises';

export function parseWindowSpec(input) {
  if (!input) {
    return [];
  }

  const values = String(input)
    .split(',')
    .flatMap(part => {
      const trimmed = part.trim();
      if (!trimmed) {
        return [];
      }
      if (trimmed.includes('-')) {
        const [startRaw, endRaw] = trimmed.split('-', 2);
        const start = Number(startRaw);
        const end = Number(endRaw);
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return [];
        }
        const result = [];
        const step = start <= end ? 1 : -1;
        for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
          result.push(current);
        }
        return result;
      }
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? [numeric] : [];
    });

  return [...new Set(values)].filter(Boolean);
}

export function selectWindows(allWindows, requested) {
  if (!requested.length) {
    return allWindows;
  }

  const set = new Set(requested);
  return allWindows.filter(windowInfo => set.has(windowInfo.number));
}

export async function jitterBetween(minMs, maxMs, enabled = true) {
  if (!enabled) {
    return 0;
  }

  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(duration);
  return duration;
}

export function resolveConcurrency(rawValue, totalWindows) {
  if (rawValue == null || rawValue === '') {
    return 1;
  }

  if (typeof rawValue === 'string' && rawValue.toLowerCase() === 'all') {
    return Math.max(1, totalWindows);
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(totalWindows, Math.floor(parsed)));
}
