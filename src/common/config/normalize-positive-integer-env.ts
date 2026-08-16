export function normalizePositiveIntegerEnv(
  key: string,
  value: unknown
): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return String(value);
    throw new Error(`${key} must be a positive integer; received ${value}`);
  }

  if (typeof value !== 'string') {
    throw new Error(
      `${key} must be a positive integer; received type ${typeof value}`
    );
  }

  let normalized = value.trim();
  const quote = normalized.at(0);
  if (
    normalized.length >= 2 &&
    (quote === '"' || quote === "'") &&
    normalized.at(-1) === quote
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Optional variables exported as an empty string are equivalent to unset.
  if (normalized === '') return undefined;

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `${key} must be a positive integer; received ${JSON.stringify(value)} (string)`
    );
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(
      `${key} must be a positive integer; received ${JSON.stringify(value)} (string)`
    );
  }

  return String(parsed);
}
