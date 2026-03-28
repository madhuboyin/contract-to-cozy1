export type GuidanceContinuityContext = {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
  homeAssetId?: string | null;
};

type SearchParamLike = {
  get(name: string): string | null;
};

function hasScheme(value: string) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function buildGuidanceParams(context: GuidanceContinuityContext): URLSearchParams {
  const params = new URLSearchParams();
  if (context.guidanceJourneyId) params.set('guidanceJourneyId', context.guidanceJourneyId);
  if (context.guidanceStepKey) params.set('guidanceStepKey', context.guidanceStepKey);
  if (context.guidanceSignalIntentFamily) {
    params.set('guidanceSignalIntentFamily', context.guidanceSignalIntentFamily);
  }
  if (context.itemId) params.set('itemId', context.itemId);
  if (context.homeAssetId) params.set('homeAssetId', context.homeAssetId);
  return params;
}

export function extractGuidanceContinuityContext(searchParams: SearchParamLike): GuidanceContinuityContext {
  return {
    guidanceJourneyId: searchParams.get('guidanceJourneyId'),
    guidanceStepKey: searchParams.get('guidanceStepKey'),
    guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
    itemId: searchParams.get('itemId'),
    homeAssetId: searchParams.get('homeAssetId'),
  };
}

export function hasGuidanceContinuityContext(context: GuidanceContinuityContext): boolean {
  return Boolean(
    context.guidanceJourneyId || context.guidanceStepKey || context.guidanceSignalIntentFamily
  );
}

export function appendGuidanceContinuityToHref(
  href: string,
  context: GuidanceContinuityContext
): string {
  if (!href || !hasGuidanceContinuityContext(context)) return href;

  try {
    const guidanceParams = buildGuidanceParams(context);
    if (!guidanceParams.toString()) return href;

    const isAbsolute = hasScheme(href) || href.startsWith('//');
    const base = isAbsolute ? undefined : 'http://localhost';
    const url = new URL(href, base);

    guidanceParams.forEach((value, key) => {
      if (!url.searchParams.get(key)) {
        url.searchParams.set(key, value);
      }
    });

    if (isAbsolute) return url.toString();
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}
