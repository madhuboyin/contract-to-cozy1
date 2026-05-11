const SAFE_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);
const SAME_ORIGIN_BASE = 'https://contracttocozy.local';

interface SafeHrefOptions {
  allowRelative?: boolean;
  allowHttp?: boolean;
}

export function toSafeHref(
  raw: string | null | undefined,
  options: SafeHrefOptions = {}
): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed, SAME_ORIGIN_BASE);
    const isRelative = parsed.origin === SAME_ORIGIN_BASE;

    if (isRelative) {
      if (!options.allowRelative) return undefined;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol === 'http:' && options.allowHttp) {
      return parsed.toString();
    }

    if (SAFE_PROTOCOLS.has(parsed.protocol)) {
      return parsed.toString();
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function toSafeAppPath(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed, SAME_ORIGIN_BASE);
    if (parsed.origin !== SAME_ORIGIN_BASE) {
      return undefined;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

export function toSafeExternalHttpUrl(
  raw: string | null | undefined,
  options: { allowHttp?: boolean } = {}
): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }

    if (parsed.protocol === 'http:' && options.allowHttp) {
      return parsed.toString();
    }

    return undefined;
  } catch {
    return undefined;
  }
}
