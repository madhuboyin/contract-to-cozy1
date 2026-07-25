type SearchParamsReader = Pick<URLSearchParams, 'get' | 'toString'>;

export function projectTrackerLineage(searchParams: SearchParamsReader) {
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

export function projectTrackerLaunchQuery(
  searchParams: SearchParamsReader,
): string {
  return new URLSearchParams(searchParams.toString()).toString();
}
