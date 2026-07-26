import { z } from 'zod';

export const propertyCoordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const countyFipsSchema = z.string().regex(/^\d{5}$/, 'County FIPS must contain exactly 5 digits');

export const usZipCodeSchema = z.string().transform((value, ctx) => {
  const compact = value.trim().replace(/\s+/g, '');
  const match = compact.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match) {
    ctx.addIssue({
      code: 'custom',
      message: 'US ZIP code must be 5 digits or ZIP+4',
    });
    return z.NEVER;
  }
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
});

export type PropertyLocationIdentity = {
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type PropertyLocationPatch = Partial<PropertyLocationIdentity>;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizedIdentity(
  current: PropertyLocationIdentity,
  patch: PropertyLocationPatch = {},
): PropertyLocationIdentity {
  return {
    address: normalizeText(patch.address ?? current.address),
    city: normalizeText(patch.city ?? current.city),
    state: (patch.state ?? current.state).trim().toUpperCase(),
    zipCode: normalizeUsZip(patch.zipCode ?? current.zipCode),
  };
}

export function normalizeUsZip(value: string): string {
  return usZipCodeSchema.parse(value);
}

export function normalizeCountyFips(value: string): string {
  return countyFipsSchema.parse(value.trim());
}

export function hasPropertyLocationIdentityChanged(
  current: PropertyLocationIdentity,
  patch: PropertyLocationPatch,
): boolean {
  const before = normalizedIdentity(current);
  const after = normalizedIdentity(current, patch);
  return (
    before.address !== after.address ||
    before.city !== after.city ||
    before.state !== after.state ||
    before.zipCode !== after.zipCode
  );
}

export function buildPropertyGeographyInvalidation(
  nextZipCode: string,
): {
  normalizedZipCode: string;
  latitude: null;
  longitude: null;
  geocodedZipCode: null;
  county: null;
  countyFips: null;
  geocodingStatus: 'PENDING';
  geocodingProvider: null;
  geocodingVersion: null;
  geocodedAt: null;
  geographyVersion: { increment: 1 };
} {
  return {
    normalizedZipCode: normalizeUsZip(nextZipCode),
    latitude: null,
    longitude: null,
    geocodedZipCode: null,
    county: null,
    countyFips: null,
    geocodingStatus: 'PENDING',
    geocodingProvider: null,
    geocodingVersion: null,
    geocodedAt: null,
    geographyVersion: { increment: 1 },
  };
}
