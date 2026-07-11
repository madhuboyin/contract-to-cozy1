// apps/backend/src/services/environment/types.ts
//
// Shared result envelope for every Environment-report sub-service. A section
// never throws — any failure (timeout, missing token, unresolved FIPS code)
// becomes { status: 'unavailable' }, so one dead external API degrades only
// its own section instead of failing the whole report.

export type SectionResult<T> =
  | { status: 'ok'; data: T; fetchedAt: string }
  | { status: 'unavailable'; reason?: string };

export interface EnvironmentLocation {
  latitude: number;
  longitude: number;
  countyFips: string | null;
  zipCode: string | null;
}
