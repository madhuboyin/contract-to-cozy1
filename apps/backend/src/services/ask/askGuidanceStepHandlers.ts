// How Ask treats each guided-journey step, by the tool the step launches.
// (Guided journey continuation design, section 3.3.)
//
//   IN_ASK         an Ask operation exists AND reports the step's completion with proof (design 3.4)
//   INLINE_CAPTURE the step only needs context facts Ask can capture inline
//   NAVIGATE       keep the link to the step's tool, with the reason
//
// Phase 1 classifies every tool key NAVIGATE: a key moves to IN_ASK only after its Ask operation reports completion
// (Phase 0 did that for recalls; the operation that continues a recall step from a journey comes with Phase 2).
// A test requires every tool key used by the template registry to be classified, so a new template step cannot
// silently default.

export type AskGuidanceStepMode = 'IN_ASK' | 'INLINE_CAPTURE' | 'NAVIGATE';

const NOT_YET = 'Ask does not complete this step with recorded proof yet, so it is finished in its own tool.';

export const ASK_GUIDANCE_STEP_TOOL_MODES: Readonly<Record<string, { mode: AskGuidanceStepMode; reason: string }>> = Object.freeze({
  booking: { mode: 'NAVIGATE', reason: 'Booking a provider is an external flow Ask does not run.' },
  'capital-timeline': { mode: 'NAVIGATE', reason: NOT_YET },
  'coverage-intelligence': { mode: 'NAVIGATE', reason: NOT_YET },
  'do-nothing-simulator': { mode: 'NAVIGATE', reason: NOT_YET },
  documents: { mode: 'NAVIGATE', reason: NOT_YET },
  frontend: { mode: 'NAVIGATE', reason: 'This step is completed on the page with its own proof.' },
  'guidance-overview': { mode: 'NAVIGATE', reason: NOT_YET },
  'history-verify': { mode: 'NAVIGATE', reason: NOT_YET },
  'home-event-radar': { mode: 'NAVIGATE', reason: NOT_YET },
  'home-savings': { mode: 'NAVIGATE', reason: NOT_YET },
  incidents: { mode: 'NAVIGATE', reason: NOT_YET },
  'inspection-report': { mode: 'NAVIGATE', reason: NOT_YET },
  maintenance: { mode: 'NAVIGATE', reason: NOT_YET },
  'negotiation-shield': { mode: 'NAVIGATE', reason: NOT_YET },
  'ownership-costs': { mode: 'NAVIGATE', reason: NOT_YET },
  'price-finalization': { mode: 'NAVIGATE', reason: NOT_YET },
  'project-completion': { mode: 'NAVIGATE', reason: NOT_YET },
  'project-tracker': { mode: 'NAVIGATE', reason: NOT_YET },
  'quote-comparison': { mode: 'NAVIGATE', reason: NOT_YET },
  recalls: { mode: 'NAVIGATE', reason: NOT_YET },
  'replace-repair': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-model-comparison': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-plan-followup': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-planning': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-priorities-capture': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-purchase-finalization': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-purchase-options': { mode: 'NAVIGATE', reason: NOT_YET },
  'service-price-radar': { mode: 'NAVIGATE', reason: NOT_YET },
});

/** An unclassified (or absent) tool key is NAVIGATE: Ask never claims to handle a step it has not been cleared for. */
export function askGuidanceStepMode(toolKey: string | null | undefined): { mode: AskGuidanceStepMode; reason: string } {
  return (toolKey ? ASK_GUIDANCE_STEP_TOOL_MODES[toolKey] : undefined)
    ?? { mode: 'NAVIGATE', reason: NOT_YET };
}
