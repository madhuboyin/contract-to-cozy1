type HomeRiskReplayLaunchOptions = {
  propertyId: string;
  runId?: string | null;
  windowType?: string | null;
  launchSurface?: string | null;
};

function setParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value === null || value === undefined) return;
  const nextValue = value.trim();
  if (!nextValue) return;
  params.set(key, nextValue);
}

export function buildHomeRiskReplayHref({
  propertyId,
  runId,
  windowType,
  launchSurface,
}: HomeRiskReplayLaunchOptions): string {
  const params = new URLSearchParams();
  setParam(params, 'runId', runId);
  setParam(params, 'windowType', windowType);
  setParam(params, 'launchSurface', launchSurface);

  const query = params.toString();
  return `/dashboard/properties/${propertyId}/tools/home-risk-replay${query ? `?${query}` : ''}`;
}
