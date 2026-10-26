// The loss-prevention plan in Ask (the desktop Coverage & Premium Review "Reduce loss risk" tab, which shows the Risk Premium Optimizer's saved plan).
// Pure: the request detection, the ranking, and the rows.
//
// Ranked the way the question asks: first by how serious the premium driver is that a step addresses (a step for a peril with a HIGH driver comes before one
// for a LOW driver), then by the step's own priority, then by readiness to act (a step the household can do itself comes before one that needs a
// professional or a carrier answer first), then by cost. Plan steps are loss-prevention work, never a savings promise: whether a carrier gives any credit for
// a step is shown only as the plan records it, and an unconfirmed credit is said to be unconfirmed.

/** "What loss-prevention work matters most?", "show my risk mitigation plan", "what are my premium risk drivers". Narrow: names the plan or the work. */
const RISK_PLAN_PATTERN = /\b(?:loss[- ]prevention|risk[- ]mitigation|mitigation (?:plan|steps?|work)|premium (?:risk )?drivers?|reduce (?:my )?(?:insurance|loss|claim) risk)\b/i;
export const isRiskMitigationPlanRequest = (message: string) => RISK_PLAN_PATTERN.test(message);
export const RISK_MITIGATION_PLAN_MESSAGE = 'What loss-prevention work matters most?';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProfessionalHelp = 'DIY_ALLOWED' | 'PROFESSIONAL_RECOMMENDED' | 'QUALIFIED_PROFESSIONAL_REQUIRED' | 'ASK_CARRIER';

export interface RiskDriverInput { code: string; title: string; detail: string; severity: RiskSeverity; relatedPerils?: readonly string[] | null }
export interface RiskPlanItemInput {
  id: string; actionType: string; status: string; priority: RiskSeverity; targetPeril?: string | null; title?: string | null; why: string;
  estimatedCost?: number | null; carrierBenefitStatus: 'UNKNOWN' | 'CONFIRMED_ELIGIBLE' | 'CONFIRMED_NOT_ELIGIBLE'; carrierReviewQuestion: string;
  professionalHelpLevel: ProfessionalHelp; handoff?: { safetyNote?: string | null } | null;
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
/** Lower is more ready to act on now. */
const READINESS_RANK: Record<ProfessionalHelp, number> = { DIY_ALLOWED: 0, PROFESSIONAL_RECOMMENDED: 1, QUALIFIED_PROFESSIONAL_REQUIRED: 2, ASK_CARRIER: 3 };
export const OPEN_PLAN_STATUSES: readonly string[] = ['RECOMMENDED', 'PLANNED', 'RESTORED'];
const titleCase = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const PERIL_LABELS: Record<string, string> = { WATER: 'Water', FIRE: 'Fire', WIND_HAIL: 'Wind and hail', THEFT: 'Theft', LIABILITY: 'Liability', ELECTRICAL: 'Electrical', OTHER: 'Other' };
export const PROFESSIONAL_HELP_LABELS: Record<ProfessionalHelp, string> = {
  DIY_ALLOWED: 'You can do this yourself', PROFESSIONAL_RECOMMENDED: 'A professional is recommended', QUALIFIED_PROFESSIONAL_REQUIRED: 'Needs a qualified professional', ASK_CARRIER: 'Ask your carrier first',
};
export const CARRIER_BENEFIT_LABELS: Record<RiskPlanItemInput['carrierBenefitStatus'], string> = {
  UNKNOWN: 'Carrier credit not confirmed', CONFIRMED_ELIGIBLE: 'Carrier confirmed it is eligible for a credit', CONFIRMED_NOT_ELIGIBLE: 'Carrier confirmed it earns no credit',
};

/** The most serious driver that names a peril, so a step is ranked by the driver it addresses. */
export function driverForPeril(peril: string | null | undefined, drivers: readonly RiskDriverInput[]): RiskDriverInput | null {
  if (!peril) return null;
  return drivers.filter((driver) => (driver.relatedPerils ?? []).includes(peril))
    .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])[0] ?? null;
}

/** Open steps in the order described above; stable for ties. */
export function rankMitigationPlanItems(items: readonly RiskPlanItemInput[], drivers: readonly RiskDriverInput[]): RiskPlanItemInput[] {
  const driverRank = (item: RiskPlanItemInput) => SEVERITY_RANK[driverForPeril(item.targetPeril, drivers)?.severity ?? 'LOW'];
  return items.filter((item) => OPEN_PLAN_STATUSES.includes(item.status)).map((item, index) => ({ item, index })).sort((left, right) =>
    driverRank(right.item) - driverRank(left.item)
    || SEVERITY_RANK[right.item.priority] - SEVERITY_RANK[left.item.priority]
    || READINESS_RANK[left.item.professionalHelpLevel] - READINESS_RANK[right.item.professionalHelpLevel]
    || (left.item.estimatedCost ?? Number.POSITIVE_INFINITY) - (right.item.estimatedCost ?? Number.POSITIVE_INFINITY)
    || left.index - right.index).map((entry) => entry.item);
}

/** One row per step. No link is carried: the plan's own hand-off points at a desktop page, and the safety note and the carrier question are what matter here. */
export function riskPlanRows(ranked: readonly RiskPlanItemInput[], drivers: readonly RiskDriverInput[], money: (value: number) => string) {
  return ranked.map((item, index) => {
    const driver = driverForPeril(item.targetPeril, drivers);
    const detail = [`Ask your carrier: ${item.carrierReviewQuestion}`, item.handoff?.safetyNote ? `Safety: ${item.handoff.safetyNote}` : null].filter(Boolean).join('\n');
    return {
      id: `risk-plan-${item.id}`, title: item.title || titleCase(item.actionType), description: item.why,
      meta: [
        `${titleCase(item.priority)} priority`, ...(item.targetPeril ? [PERIL_LABELS[item.targetPeril] ?? titleCase(item.targetPeril)] : []),
        ...(driver ? [`Addresses: ${driver.title}`] : []), ...(item.estimatedCost != null ? [`About ${money(item.estimatedCost)}`] : []),
        PROFESSIONAL_HELP_LABELS[item.professionalHelpLevel], CARRIER_BENEFIT_LABELS[item.carrierBenefitStatus], ...(item.status === 'PLANNED' ? ['Planned'] : []),
      ],
      status: item.status, href: null, countLabel: String(index + 1), detail,
    };
  });
}
