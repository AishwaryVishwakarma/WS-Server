export function normalizeBooleanEnv(
  key: string,
  value: unknown
): 'true' | 'false' | undefined {
  if (value === undefined) return undefined;

  let normalized =
    typeof value === 'boolean' ? String(value) : String(value).trim();

  const quote = normalized.at(0);
  if (
    normalized.length >= 2 &&
    (quote === '"' || quote === "'") &&
    normalized.at(-1) === quote
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.toLowerCase();
  if (normalized === 'true' || normalized === 'false') return normalized;

  const received =
    typeof value === 'string' ? JSON.stringify(value) : String(value);
  throw new Error(
    `${key} must be true or false; received ${received} (${typeof value})`
  );
}
