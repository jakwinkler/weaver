export const SECRET_MASK = '********';
export const isSecretKey = (key: string): boolean =>
  /^pass$|password|secret|token|private.?key|api.?key/i.test(key);

/** Mask configured values without changing the response shape used by existing settings forms. */
export function redactSettingsSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSettingsSecrets) as T;
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSecretKey(key) && typeof item === 'string' && item
        ? SECRET_MASK
        : redactSettingsSecrets(item),
    ]),
  ) as T;
}

export function preserveSettingsSecrets<T>(submitted: T, current: unknown): T {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return submitted;
  const existing =
    current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(submitted).map(([key, value]) => [
      key,
      isSecretKey(key) && (value === SECRET_MASK || value === '')
        ? (existing[key] ?? '')
        : preserveSettingsSecrets(value, existing[key]),
    ]),
  ) as T;
}
