// BICC-TRN-007: latency budgets are measured separately for deterministic reads, model-planned reads, composed reads, attachment analysis and consequential
// confirmation. This is the one place a turn is put in a class, so every dashboard and budget reads the same label. The order below is the order of precedence: a
// turn that is several things is counted in the most demanding class it touched.
export const LATENCY_CLASSES = ['CONSEQUENTIAL_CONFIRMATION', 'ATTACHMENT_ANALYSIS', 'COMPOSED_READ', 'MODEL_PLANNED_READ', 'DETERMINISTIC_READ'] as const;
export type LatencyClass = typeof LATENCY_CLASSES[number];

export function classifyLatency(turn: { confirmation?: boolean; attachment?: boolean; composed?: boolean; modelPlanned?: boolean }): LatencyClass {
  if (turn.confirmation) return 'CONSEQUENTIAL_CONFIRMATION';
  if (turn.attachment) return 'ATTACHMENT_ANALYSIS';
  if (turn.composed) return 'COMPOSED_READ';
  if (turn.modelPlanned) return 'MODEL_PLANNED_READ';
  return 'DETERMINISTIC_READ';
}
