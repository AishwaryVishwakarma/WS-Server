export function normalizeBooleanEnv(
  key: string,
  value: unknown
): 'true' | 'false' | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'string') {
    throw new Error(
      `${key} must be true or false; received type ${typeof value}`
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

  normalized = normalized.toLowerCase();
  if (normalized === 'true' || normalized === 'false') return normalized;

  throw new Error(
    `${key} must be true or false; received ${JSON.stringify(value)} (string)`
  );
}
