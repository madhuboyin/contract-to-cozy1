// BICC-4.3: the wording and shapes for moving a candidate home to "my homes" as under contract. Pure, so the copy is tested without rendering.
export type PromotionField = { field: string; value: string | number; source: string | null; asOf: string | null };
export type PromotionReview = {
  proposal: { candidateId: string; fields: PromotionField[]; missingRequired: string[]; notCarriedOver: string[] };
  token: string;
  existingHome: { propertyId: string; name: string | null; address: string } | null;
  canPromote: boolean;
};
export type PromotionResult = { propertyId: string; created: boolean; linkedExisting: boolean; candidateId: string };

const LABELS: Record<string, string> = { address: 'Street address', city: 'City', state: 'State', zipCode: 'ZIP code', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', propertySize: 'Living area (sq ft)', yearBuilt: 'Year built' };

/** Where a carried fact came from, in plain words; no source is claimed when none was recorded. */
export function fieldSourceText(field: PromotionField): string {
  if (field.source === 'LISTING') return field.asOf ? `from the listing, ${field.asOf.slice(0, 10)}` : 'from the listing';
  if (field.source === 'USER_ENTERED') return field.asOf ? `entered by you, ${field.asOf.slice(0, 10)}` : 'entered by you';
  return 'source not recorded';
}

export const fieldLabel = (field: string): string => LABELS[field] ?? field;

/** The review's headline, or the reason it cannot go ahead yet. */
export function promotionHeadline(review: PromotionReview): string {
  if (!review.canPromote) return `Add the ${review.proposal.missingRequired.join(', ')} before moving this home.`;
  if (review.existingHome) return `You already have a home at ${review.existingHome.address}. You can link this one to it instead of creating a second.`;
  return 'This creates a new home in your account, marked as under contract. Review what will be carried over.';
}
