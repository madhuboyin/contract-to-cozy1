// apps/frontend/src/components/localUpdates/localUpdates.types.ts

export type LocalUpdateCategory = "INTERNET" | "INSURANCE" | "MAINTENANCE" | "ENERGY";

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

export interface LocalUpdatesCarouselProps {
  updates: LocalUpdateDTO[];
  onDismiss: (updateId: string) => void;
  onCtaClick: (updateId: string) => void;
}
