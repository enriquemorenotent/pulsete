export type RequestOriginPolicy = {
  addAllowedOrigin(origin: string): void;
  allows(origin: string | undefined): boolean;
};

export const createRequestOriginPolicy = (
  configuredOrigins: readonly string[] = [],
): RequestOriginPolicy => {
  const allowedOrigins = new Set(configuredOrigins.map(normalizeConfiguredOrigin));

  return {
    addAllowedOrigin(origin) {
      allowedOrigins.add(normalizeConfiguredOrigin(origin));
    },
    allows(origin) {
      if (origin === undefined) {
        // Origin is a browser signal. Local non-browser clients are handled by
        // the separate authentication boundary.
        return true;
      }
      const normalized = normalizeRequestOrigin(origin);
      return normalized !== null && allowedOrigins.has(normalized);
    },
  };
};

const normalizeConfiguredOrigin = (value: string) => {
  const url = parseHttpUrl(value);
  if (!url || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error(`Invalid allowed origin: ${value}`);
  }
  return url.origin;
};

const normalizeRequestOrigin = (value: string) => {
  const url = parseHttpUrl(value);
  return url && value === url.origin ? url.origin : null;
};

const parseHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};
