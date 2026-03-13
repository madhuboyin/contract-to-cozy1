function appendQueryParam(href: string, key: string, value: string | null | undefined): string {
  if (!value) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function propertyChooserFallback(href: string): string {
  const toolMatch = href.match(/^\/dashboard\/properties\/:propertyId\/tools\/([^/?#]+)/);
  if (toolMatch) {
    return `/dashboard/properties?navTarget=${encodeURIComponent(`tool:${toolMatch[1]}`)}`;
  }

  if (/^\/dashboard\/properties\/:propertyId\/seller-prep(\/|$)/.test(href)) {
    return '/dashboard/properties?navTarget=seller-prep';
  }

  if (/^\/dashboard\/properties\/:propertyId\/timeline(\/|$)/.test(href)) {
    return '/dashboard/properties?navTarget=home-timeline';
  }

  if (/^\/dashboard\/properties\/:propertyId\/status-board(\/|$)/.test(href)) {
    return '/dashboard/properties?navTarget=status-board';
  }

  if (/^\/dashboard\/properties\/:propertyId\/reports(\/|$)/.test(href)) {
    return '/dashboard/properties?navTarget=reports';
  }

  if (/^\/dashboard\/properties\/:propertyId\/home-score(\/|$)/.test(href)) {
    return '/dashboard/properties?navTarget=home-score';
  }

  return '/dashboard/properties';
}

export function withKnowledgeProperty(href: string, propertyId?: string | null): string {
  if (!propertyId) return href;
  return appendQueryParam(href, 'propertyId', propertyId);
}

export function buildKnowledgeArticleHref(slug: string, propertyId?: string | null): string {
  return withKnowledgeProperty(`/knowledge/${slug}`, propertyId);
}

export function resolveKnowledgeActionHref(
  href: string | null | undefined,
  propertyId?: string | null
): { href: string | null; requiresProperty: boolean } {
  if (!href) {
    return { href: null, requiresProperty: false };
  }

  if (href.includes(':propertyId')) {
    if (propertyId) {
      return {
        href: href.replace(':propertyId', encodeURIComponent(propertyId)),
        requiresProperty: false,
      };
    }

    return {
      href: propertyChooserFallback(href),
      requiresProperty: true,
    };
  }

  if (propertyId && href.startsWith('/dashboard/')) {
    return {
      href: withKnowledgeProperty(href, propertyId),
      requiresProperty: false,
    };
  }

  return { href, requiresProperty: false };
}
