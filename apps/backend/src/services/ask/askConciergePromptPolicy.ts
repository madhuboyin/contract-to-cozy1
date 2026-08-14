type InventoryDecisionCandidate = {
  id: string;
  name: string;
  condition: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';
  expectedExpiryDate: Date | null;
  updatedAt: Date;
};

const DECISION_HORIZON_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;

function candidateScore(item: InventoryDecisionCandidate, now: Date): number {
  let score = item.condition === 'POOR' ? 5 : item.condition === 'FAIR' ? 3 : 0;
  if (item.expectedExpiryDate) {
    const remainingMs = item.expectedExpiryDate.getTime() - now.getTime();
    if (remainingMs <= 0) score += 5;
    else if (remainingMs <= DECISION_HORIZON_MS / 2) score += 4;
    else if (remainingMs <= DECISION_HORIZON_MS) score += 2;
  }
  return score;
}

/**
 * Entity-specific repair/replace suggestions must be backed by a current
 * property record signal. Merely having an appliance in inventory is not
 * enough to imply that the homeowner has a decision to make.
 */
export function selectInventoryDecisionCandidate(
  items: readonly InventoryDecisionCandidate[],
  now = new Date(),
): InventoryDecisionCandidate | null {
  return items
    .map((item) => ({ item, score: candidateScore(item, now) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime())[0]?.item ?? null;
}

export function inventoryDecisionQuestion(itemName: string): string {
  const safeName = itemName.trim().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
  const conversationalName = /^[A-Z][a-z]/.test(safeName)
    ? `${safeName[0].toLowerCase()}${safeName.slice(1)}`
    : safeName;
  return conversationalName
    ? `Should I repair or replace my ${conversationalName}?`
    : 'Help me compare repair and replacement options for a home system or appliance.';
}
