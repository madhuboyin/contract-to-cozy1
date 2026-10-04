// The one definition of "repair history" for every repair-versus-replace consumer: replaceRepairAnalysis (generic items),
// the HVAC repair/replace engine, Home Action recurring-failure enrichment, and the Do-Nothing simulator.
//
// Only the canonical HomeEventType.REPAIR counts, for both the repair count and the repair spend. Inspection fees and routine
// maintenance are not evidence that an item is failing, and the event model cannot yet tell corrective maintenance from preventive
// maintenance, so MAINTENANCE is excluded rather than guessed at. Replacements are not repairs. Event titles and subtypes are never
// used to classify an event. Superseded revisions (isCurrent false) and deleted events never count.
//
// If a structured maintenance-purpose field is added later, corrective maintenance can be admitted here, once, for all consumers.
export const REPAIR_HISTORY_LOOKBACK_MONTHS = 30;

export function repairHistoryEventWhere(): { type: 'REPAIR'; isCurrent: true; deletedAt: null } {
  return { type: 'REPAIR', isCurrent: true, deletedAt: null };
}
