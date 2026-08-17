import { buyerPlanReturnQuery } from '@/lib/navigation/buyerReturnContext';

type SearchParamsReader = Pick<URLSearchParams, 'get'>;

export function inspectionUploadLineage(searchParams: SearchParamsReader) {
  return {
    sourceActionId: searchParams.get('sourceActionId') ?? undefined,
    sourceEntityType: searchParams.get('sourceEntityType') ?? undefined,
    sourceEntityId: searchParams.get('sourceEntityId') ?? undefined,
    sourceJourneyId:
      searchParams.get('journeyId')
      ?? searchParams.get('guidanceJourneyId')
      ?? undefined,
  };
}

export function inspectionHubLaunchQuery(
  searchParams: SearchParamsReader,
): string {
  const query = new URLSearchParams();
  for (const key of ['sourceActionId', 'sourceEntityType', 'sourceEntityId', 'journeyId', 'guidanceJourneyId']) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  const buyerReturn = buyerPlanReturnQuery(searchParams);
  new URLSearchParams(buyerReturn).forEach((value, key) => query.set(key, value));
  return query.toString();
}
