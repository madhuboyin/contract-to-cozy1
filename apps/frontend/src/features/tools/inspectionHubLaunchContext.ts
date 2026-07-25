type SearchParamsReader = Pick<URLSearchParams, 'get' | 'toString'>;

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
  return new URLSearchParams(searchParams.toString()).toString();
}
