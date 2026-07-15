export type PriorityBand = 'LOW' | 'MEDIUM' | 'HIGH';

/** Maps the small code-owned personalization score to a display priority. */
export function priorityBandFromScore(score: number): PriorityBand {
  if (score >= 70) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}
