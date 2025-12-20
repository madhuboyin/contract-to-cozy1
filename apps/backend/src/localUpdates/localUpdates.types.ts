// apps/backend/src/localUpdates/localUpdates.types.ts
export type LocalUpdateCategory =
  | "INTERNET"
  | "INSURANCE"
  | "MAINTENANCE"
  | "ENERGY";

export interface LocalUpdateDTO {
  id: string;
  title: string;
  shortDescription: string;
  category: LocalUpdateCategory;
  sourceName: string;
  isSponsored: boolean;
  ctaText: string;
  ctaUrl?: string | null;
}
