type SearchParamsReader = Pick<URLSearchParams, 'get' | 'toString'>;

export function complianceLaunchLineage(searchParams: SearchParamsReader) {
  const sourceEntityType = searchParams.get('sourceEntityType') ?? undefined;
  const sourceEntityId = searchParams.get('sourceEntityId') ?? undefined;
  return {
    sourceActionId: searchParams.get('sourceActionId') ?? undefined,
    sourceEntityType,
    sourceEntityId,
    sourceJourneyId:
      searchParams.get('journeyId')
      ?? searchParams.get('guidanceJourneyId')
      ?? undefined,
  };
}

export function forwardComplianceLaunchQuery(
  searchParams: SearchParamsReader,
  propertyId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('propertyId', propertyId);
  return params.toString();
}
