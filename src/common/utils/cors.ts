function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isOriginAllowed(origin: string, configuredOrigins: string) {
  const normalizedOrigin = normalizeOrigin(origin);
  return configuredOrigins
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
    .some((rule) => {
      if (!rule.includes('*')) return rule === normalizedOrigin;
      const pattern = rule.split('*').map(escapeRegExp).join('.*');
      return new RegExp(`^${pattern}$`).test(normalizedOrigin);
    });
}
