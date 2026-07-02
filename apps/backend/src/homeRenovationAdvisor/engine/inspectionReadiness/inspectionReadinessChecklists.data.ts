// apps/backend/src/homeRenovationAdvisor/engine/inspectionReadiness/inspectionReadinessChecklists.data.ts
//
// Static v1 "commonly checked items" per inspection stage, used to (a) build
// the AI readiness-review prompt and (b) render the checklist in the UI.
//
// Educational / general reference only — NOT jurisdiction-specific code
// interpretation. Actual inspector checklists vary by AHJ (authority having
// jurisdiction). This tool does not interpret what the inspector checks for
// or what code compliance requires; it flags commonly-expected items so a
// homeowner can self-review before calling for the real inspection.

import { RenovationInspectionStageType } from '@prisma/client';

export interface ReadinessChecklistItem {
  key: string; // stable key, referenced in ChecklistItemResult.itemKey — do not rename once shipped
  label: string; // shown in UI + fed to AI prompt as the criterion
  aiGuidance: string; // extra detail for the AI prompt on what to look for in a photo
}

export const INSPECTION_READINESS_CHECKLIST_VERSION = 'v1';

export const INSPECTION_READINESS_CHECKLISTS: Record<RenovationInspectionStageType, ReadinessChecklistItem[]> = {
  FOUNDATION: [
    {
      key: 'foundation_rebar_visible',
      label: 'Rebar/reinforcement visible and positioned before pour',
      aiGuidance: 'Look for reinforcing steel bars placed within the formwork, not yet covered by concrete.',
    },
    {
      key: 'foundation_forms_braced',
      label: 'Forms are square, level, and braced',
      aiGuidance: 'Check that formwork appears straight, adequately braced, and free of obvious gaps or leaning.',
    },
    {
      key: 'foundation_anchor_bolts',
      label: 'Anchor bolts or foundation connectors present at required spacing',
      aiGuidance: 'Look for anchor bolts or hold-down hardware embedded in or attached to the foundation.',
    },
    {
      key: 'foundation_drainage_clear',
      label: 'Excavation/drainage area clear of standing water and debris',
      aiGuidance: 'Check for standing water, loose debris, or backfill material that could obstruct inspection access.',
    },
  ],
  FRAMING: [
    {
      key: 'framing_lumber_visible',
      label: 'Framing lumber visible and accessible (not yet covered by drywall/sheathing)',
      aiGuidance: 'Confirm studs, joists, and rafters are exposed and not yet closed in by drywall or exterior sheathing.',
    },
    {
      key: 'framing_fire_blocking',
      label: 'Fire blocking installed at required locations (stud cavities, stair stringers)',
      aiGuidance: 'Look for horizontal blocking pieces installed within wall cavities and along stair stringers.',
    },
    {
      key: 'framing_connectors',
      label: 'Joist hangers / structural connectors properly installed and nailed off',
      aiGuidance: 'Check that metal joist hangers or structural connectors are fully nailed with no missing fasteners.',
    },
    {
      key: 'framing_headers_sized',
      label: 'Headers appear present over door/window openings',
      aiGuidance: 'Look for a header (doubled or engineered lumber) spanning the top of each door and window opening.',
    },
    {
      key: 'framing_bracing',
      label: 'Wall bracing or structural sheathing installed where visible',
      aiGuidance: 'Check for let-in bracing, metal strap bracing, or structural sheathing panels on exterior walls.',
    },
  ],
  ROUGH_IN: [
    {
      key: 'roughin_wiring_secured',
      label: 'Electrical wiring stapled/secured and protected from damage',
      aiGuidance: 'Look for Romex or conduit secured to framing at proper intervals, with nail plates over holes drilled near the face of studs.',
    },
    {
      key: 'roughin_plumbing_no_leaks',
      label: 'Plumbing lines show no visible active leaks',
      aiGuidance: 'Check pipe joints and fittings for visible water staining, dripping, or pooling.',
    },
    {
      key: 'roughin_ductwork_sealed',
      label: 'Ductwork joints appear sealed',
      aiGuidance: 'Look for sealed/taped joints on visible HVAC ductwork, without obvious gaps.',
    },
    {
      key: 'roughin_boxes_accessible',
      label: 'Electrical/plumbing boxes are accessible and not buried in framing',
      aiGuidance: 'Check that junction boxes and plumbing access points are mounted flush and reachable, not recessed behind framing members.',
    },
  ],
  ELECTRICAL: [
    {
      key: 'electrical_panel_labeled',
      label: 'Electrical panel circuits are labeled',
      aiGuidance: 'Look for a legible circuit directory/labels on or near the panel door.',
    },
    {
      key: 'electrical_gfci_afci',
      label: 'GFCI/AFCI protection present where visible (kitchens, baths, bedrooms, exterior)',
      aiGuidance: 'Check for GFCI outlets or AFCI breaker labels in areas that typically require them.',
    },
    {
      key: 'electrical_no_exposed_splices',
      label: 'No exposed wire splices outside of a covered junction box',
      aiGuidance: 'Look for any bare wire connections not enclosed in a covered box.',
    },
    {
      key: 'electrical_grounding',
      label: 'Grounding conductors visible and connected',
      aiGuidance: 'Check for a visible grounding wire connected to the panel, boxes, or devices.',
    },
  ],
  PLUMBING: [
    {
      key: 'plumbing_fixtures_set',
      label: 'Fixtures set and connections appear watertight',
      aiGuidance: 'Look for fixtures (sink, toilet, tub) properly seated with no visible gaps at supply/drain connections.',
    },
    {
      key: 'plumbing_shutoffs_present',
      label: 'Shutoff valves present at fixtures',
      aiGuidance: 'Check for accessible shutoff valves at supply lines feeding each fixture.',
    },
    {
      key: 'plumbing_vent_present',
      label: 'Vent piping visible where required',
      aiGuidance: 'Look for vent stacks/piping connected to the drain system, typically running toward the roof.',
    },
    {
      key: 'plumbing_no_leaks',
      label: 'No visible active leaks at joints or fixtures',
      aiGuidance: 'Check for water staining, dripping, or pooling near pipe joints and fixture connections.',
    },
  ],
  MECHANICAL: [
    {
      key: 'mechanical_unit_secured',
      label: 'HVAC unit(s) secured and level',
      aiGuidance: 'Check that the equipment appears properly mounted/secured and level, not resting loosely.',
    },
    {
      key: 'mechanical_clearances',
      label: 'Required clearances around equipment appear maintained',
      aiGuidance: 'Look for adequate open space around the unit, free of stored materials or obstructions.',
    },
    {
      key: 'mechanical_venting',
      label: 'Venting/flue installed and appears properly terminated',
      aiGuidance: 'Check that exhaust venting or flue piping is connected and routed to an appropriate termination point.',
    },
    {
      key: 'mechanical_condensate',
      label: 'Condensate drainage present where applicable',
      aiGuidance: 'Look for a condensate drain line or pan routed away from the unit.',
    },
  ],
  INSULATION: [
    {
      key: 'insulation_installed_depth',
      label: 'Insulation installed to a consistent, visible depth/thickness',
      aiGuidance: 'Check that insulation fills the cavity without visible gaps or compressed/thin spots.',
    },
    {
      key: 'insulation_vapor_barrier',
      label: 'Vapor barrier (if used) oriented correctly and intact',
      aiGuidance: 'Look for a continuous vapor barrier facing the correct direction, without tears.',
    },
    {
      key: 'insulation_penetrations_sealed',
      label: 'Gaps around penetrations (pipes, wires, vents) are sealed or insulated',
      aiGuidance: 'Check for sealant, foam, or insulation packed around pipe/wire penetrations through the envelope.',
    },
  ],
  FINAL: [
    {
      key: 'final_fixtures_functional',
      label: 'Fixtures and finishes installed and appear functional',
      aiGuidance: 'Look for completed, installed fixtures (outlets, switches, plumbing fixtures) with cover plates on.',
    },
    {
      key: 'final_no_exposed_wiring',
      label: 'No exposed wiring or unfinished electrical work visible',
      aiGuidance: 'Check for any bare wires, missing cover plates, or unfinished electrical connections.',
    },
    {
      key: 'final_egress_clear',
      label: 'Egress windows/doors are clear and operable-looking',
      aiGuidance: 'Look for windows/doors that appear unobstructed and openable in bedrooms or required egress locations.',
    },
    {
      key: 'final_smoke_co_detectors',
      label: 'Smoke/CO detectors appear installed',
      aiGuidance: 'Check for smoke or carbon monoxide detectors mounted on walls or ceilings in expected locations.',
    },
    {
      key: 'final_site_clean',
      label: 'Work area is clean and clear of debris/materials for inspector access',
      aiGuidance: 'Look for a tidy work area without construction debris blocking access to the work being inspected.',
    },
  ],
  PLAN_REVIEW: [], // documentation-only stage, nothing to photograph
  PRE_CONSTRUCTION: [], // documentation-only stage, nothing to photograph
  OTHER: [
    {
      key: 'other_work_appears_complete',
      label: 'Work area appears complete per photos',
      aiGuidance: 'Assess whether the work shown looks finished and consistent with the stated stage.',
    },
    {
      key: 'other_no_visible_hazards',
      label: 'No visible safety hazards',
      aiGuidance: 'Look for obvious hazards: exposed wiring, trip hazards, unsecured materials, missing guards/railings.',
    },
    {
      key: 'other_access_clear',
      label: 'Debris/materials cleared for inspector access',
      aiGuidance: 'Check that the work area is reasonably clear so an inspector could access and view the work.',
    },
  ],
};

export function getReadinessChecklist(stageType: RenovationInspectionStageType): ReadinessChecklistItem[] {
  return INSPECTION_READINESS_CHECKLISTS[stageType] ?? [];
}
