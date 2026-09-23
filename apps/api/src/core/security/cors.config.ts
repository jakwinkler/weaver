const DEFAULT_CORS_ORIGINS = ['http://localhost:5173'];

function normalizeOrigin(value: string): string {
  if (value === '*') {
    throw new Error('Wildcard CORS origins are not allowed');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid CORS origin: ${value}`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Invalid CORS origin: ${value}`);
  }

  return url.origin;
}

export function getAllowedCorsOrigins(
  configuredOrigins = process.env.CORS_ORIGINS,
): string[] {
  if (configuredOrigins === undefined) {
    return DEFAULT_CORS_ORIGINS;
  }

  return [
    ...new Set(
      configuredOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeOrigin),
    ),
  ];
}

export function isCorsOriginAllowed(
  requestOrigin: string | undefined,
  configuredOrigins = process.env.CORS_ORIGINS,
): boolean {
  if (!requestOrigin) {
    return true;
  }

  return getAllowedCorsOrigins(configuredOrigins).includes(requestOrigin);
}

export function validateCorsOrigin(
  requestOrigin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  try {
    callback(null, isCorsOriginAllowed(requestOrigin));
  } catch (error) {
    callback(error as Error, false);
  }
}
