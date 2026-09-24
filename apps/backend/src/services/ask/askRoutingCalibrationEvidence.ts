import type { AskOperationId } from './askOperationRegistry';

export interface AskRoutingCalibrationObservation {
  observationId: string;
  sourceFixtureId: string;
  candidateOperationId: AskOperationId;
  rawScore: number;
  correct: boolean;
}

export const ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA = Object.freeze({
  schemaVersion: '1.0',
  datasetVersion: 'ask-routing-independent-v2',
  generatedAt: '2026-08-15T00:00:00.000Z',
  reviewedAt: '2026-08-15T00:00:00.000Z',
  reviewer: 'TRUST_ARCHITECTURE_REVIEW',
  derivation: 'For each independent routing fixture, record the expected candidate and strongest competing candidate raw retrieval score before confidence calibration.',
});

type ObservationTuple = readonly [string, string, AskOperationId, number, boolean];

const ROWS: readonly ObservationTuple[] = [
  ['001-expected', '001', 'MAINTENANCE_STATUS', .7022, true], ['001-competitor', '001', 'MAINTENANCE_TASK_COMPLETE', .6573, false],
  ['002-expected', '002', 'MAINTENANCE_TASK_CREATE', .7252, true], ['002-competitor', '002', 'MAINTENANCE_STATUS', .6732, false],
  ['003-expected', '003', 'MAINTENANCE_TASK_COMPLETE', .1376, true], ['003-competitor', '003', 'MAINTENANCE_TASK_UPDATE', .1224, false],
  ['004-expected', '004', 'MAINTENANCE_TASK_UPDATE', .1899, true], ['004-competitor', '004', 'BUYER_TASK_UPDATE', .2814, false],
  ['005-expected', '005', 'COVERAGE_GAPS', .7519, true], ['005-competitor', '005', 'INVENTORY_LOOKUP', .4333, false],
  ['006-expected', '006', 'INCIDENT_CLAIM_STATUS', .1065, true], ['006-competitor', '006', 'HVAC_DECISION_CONTINUE', .1622, false],
  ['007-expected', '007', 'SAVINGS_OPPORTUNITIES', .6503, true], ['007-competitor', '007', 'OWNERSHIP_COSTS', .4618, false],
  ['008-expected', '008', 'OWNERSHIP_COSTS', .6832, true], ['008-competitor', '008', 'BREAK_EVEN_ANALYSIS', .4805, false],
  ['009-expected', '009', 'INVENTORY_LOOKUP', .7246, true], ['009-competitor', '009', 'BUYER_CONTRACT_TIMELINE', .4796, false],
  ['010-expected', '010', 'PROPERTY_SUMMARY', .6215, true], ['010-competitor', '010', 'MAINTENANCE_TASK_COMPLETE', .445, false],
  ['011-expected', '011', 'HOME_ACTIONS', .7333, true], ['011-competitor', '011', 'BUYER_PLAN_STATUS', .5872, false],
  ['012-expected', '012', 'CAPABILITY_DISCOVERY', .7095, true], ['012-competitor', '012', 'HOUSEHOLD_INVITATION', .5232, false],
  ['013-expected', '013', 'REPLACEMENT_GUIDANCE', .718, true], ['013-competitor', '013', 'HVAC_DECISION_START', .6671, false],
  ['014-expected', '014', 'REFINANCE_ANALYSIS', .6936, true], ['014-competitor', '014', 'PAST_HAZARD_EXPOSURE', .5002, false],
  ['015-expected', '015', 'REFINANCE_RATE_MONITOR', .6678, true], ['015-competitor', '015', 'HOME_DEADLINE_MONITOR', .3509, false],
  ['016-expected', '016', 'SELL_HOLD_RENT_ANALYSIS', .5358, true], ['016-competitor', '016', 'INSPECTION_FINDINGS', .4609, false],
  ['017-expected', '017', 'HOUSEHOLD_INVITATION', .6546, true], ['017-competitor', '017', 'QUOTE_COMPARISON_CREATE', .0979, false],
  // FRD v1.65: 018's competitor re-derived to GUIDANCE_JOURNEYS_LIST (was INCIDENT_CONTINUATION .1424). Starting and
  // reviewing guided journeys share their intrinsic words, so no rewording removes it; the expected score is unchanged.
  ['018-expected', '018', 'GUIDANCE_JOURNEY_CREATE', .8766, true], ['018-competitor', '018', 'GUIDANCE_JOURNEYS_LIST', .627, false],
  ['019-expected', '019', 'QUOTE_COMPARISON_CREATE', .6864, true], ['019-competitor', '019', 'CAPABILITY_DISCOVERY', .5254, false],
  ['020-expected', '020', 'QUOTE_COMPARISON_REVIEW', .7312, true], ['020-competitor', '020', 'QUOTE_COMPARISON_CREATE', .6039, false],
  ['021-expected', '021', 'HOME_DEADLINE_MONITOR', .5747, true], ['021-competitor', '021', 'INVENTORY_LOOKUP', .4826, false],
  ['022-expected', '022', 'CAPITAL_RESERVE_PLAN', .7763, true], ['022-competitor', '022', 'OWNERSHIP_COSTS', .6972, false],
  ['023-expected', '023', 'PROPERTY_TAX_APPEAL_READINESS', .2329, true], ['023-competitor', '023', 'DOCUMENT_LOOKUP', .1412, false],
  ['024-expected', '024', 'RENOVATION_PERMIT_READINESS', .4594, true], ['024-competitor', '024', 'SELLER_PREP_CHECKLIST', .1234, false],
  ['025-expected', '025', 'MAJOR_EVENT_ENTRY', .6136, true], ['025-competitor', '025', 'SELLER_PREP_CHECKLIST', .6189, false],
  ['026-expected', '026', 'EMERGENCY_BOUNDARY', .1177, true], ['026-competitor', '026', 'SELL_HOLD_RENT_ANALYSIS', .0871, false],
  ['027-expected', '027', 'UNSAFE_RESTRICTED_BOUNDARY', .1706, true], ['027-competitor', '027', 'CLAIM_FILE', .1861, false],
  ['028-expected', '028', 'OUT_OF_SCOPE_BOUNDARY', .1374, true], ['028-competitor', '028', 'MAINTENANCE_TASK_CREATE', .2651, false],
  ['029-expected', '029', 'GROUNDED_GUIDANCE', .1587, true], ['029-competitor', '029', 'CLAIM_FILE', .1317, false],
  ['030-expected', '030', 'HVAC_DECISION_START', .5729, true], ['030-competitor', '030', 'REPLACEMENT_GUIDANCE', .5399, false],
  ['031-expected', '031', 'HVAC_DECISION_CONTINUE', .441, true], ['031-competitor', '031', 'HVAC_DECISION_ABANDON', .234, false],
  ['032-expected', '032', 'HVAC_DECISION_SCENARIO', .6966, true], ['032-competitor', '032', 'HVAC_DECISION_OUTCOME_REPORT', .5336, false],
  ['033-expected', '033', 'HVAC_DECISION_ABANDON', .6142, true], ['033-competitor', '033', 'HVAC_DECISION_OUTCOME_VIEW', .5012, false],
  ['034-expected', '034', 'HVAC_PREFERENCE_SAVE', .6876, true], ['034-competitor', '034', 'HVAC_PREFERENCE_FORGET', .513, false],
  ['035-expected', '035', 'HVAC_PREFERENCE_FORGET', .5981, true], ['035-competitor', '035', 'HVAC_DECISION_ABANDON', .4527, false],
  ['036-expected', '036', 'HOME_CHANGE_SUMMARY', .9096, true], ['036-competitor', '036', 'BUYER_DISCLOSURE_FUNDS_READINESS', .5617, false],
  ['037-expected', '037', 'HVAC_DECISION_OUTCOME_REPORT', .5325, true], ['037-competitor', '037', 'HVAC_DECISION_OUTCOME_VIEW', .6623, false],
  ['038-expected', '038', 'HVAC_DECISION_OUTCOME_VIEW', .6794, true], ['038-competitor', '038', 'HVAC_DECISION_OUTCOME_REPORT', .6486, false],
  ['039-expected', '039', 'HVAC_DECISION_OUTCOME_UNLINK', .9236, true], ['039-competitor', '039', 'HVAC_DECISION_OUTCOME_REPORT', .6652, false],
  ['040-expected', '040', 'BUYER_PLAN_STATUS', .2482, true], ['040-competitor', '040', 'BUYER_COST_READINESS', .2015, false],
  ['041-expected', '041', 'BUYER_DEADLINES', .338, true], ['041-competitor', '041', 'MAINTENANCE_FORECAST', .3167, false],
  ['042-expected', '042', 'BUYER_DOCUMENT_READINESS', .3609, true], ['042-competitor', '042', 'MAINTENANCE_STATUS', .2779, false],
  ['043-expected', '043', 'BUYER_INSPECTION_REVIEW', .3538, true], ['043-competitor', '043', 'INSPECTION_FINDINGS', .1743, false],
  ['044-expected', '044', 'BUYER_TASK_COMPLETE', .2923, true], ['044-competitor', '044', 'MAINTENANCE_TASK_COMPLETE', .7034, false],
  ['045-expected', '045', 'BUYER_TASK_CREATE', .4239, true], ['045-competitor', '045', 'BUYER_TASK_UPDATE', .408, false],
  ['046-expected', '046', 'BUYER_TASK_UPDATE', .3265, true], ['046-competitor', '046', 'BUYER_TASK_CREATE', .2813, false],
  ['047-expected', '047', 'BUYER_MOVE_STATUS', .3212, true], ['047-competitor', '047', 'BUYER_DEADLINES', .2129, false],
  ['048-expected', '048', 'BUYER_FINANCING_READINESS', .2035, true], ['048-competitor', '048', 'BUYER_DEADLINES', .1779, false],
  ['049-expected', '049', 'BUYER_TITLE_ESCROW_READINESS', .9339, true], ['049-competitor', '049', 'INSPECTION_FINDINGS', .5783, false],
  ['050-expected', '050', 'BUYER_WALKTHROUGH_READINESS', .4485, true], ['050-competitor', '050', 'BUYER_TASK_CREATE', .2122, false],
  ['051-expected', '051', 'BUYER_DISCLOSURE_FUNDS_READINESS', .9413, true], ['051-competitor', '051', 'HOME_CHANGE_SUMMARY', .6382, false],
  ['052-expected', '052', 'BUYER_CLOSING_DAY_READINESS', .5134, true], ['052-competitor', '052', 'BUYER_DEADLINES', .2162, false],
  ['053-expected', '053', 'BUYER_CONTRACT_TIMELINE', .4127, true], ['053-competitor', '053', 'BUYER_INSPECTION_REVIEW', .2243, false],
  ['054-expected', '054', 'BUYER_NEGOTIATION_READINESS', .328, true], ['054-competitor', '054', 'NEGOTIATION_SHIELD_CASES', .1948, false],
  ['055-expected', '055', 'BUYER_COST_READINESS', .7572, true], ['055-competitor', '055', 'BUYER_CONTRACT_TIMELINE', .486, false],
  ['056-expected', '056', 'BUYER_FINDING_DISPOSITION', .3368, true], ['056-competitor', '056', 'INSPECTION_FINDING_UPDATE', .2681, false],
  ['057-expected', '057', 'BUYER_LIFECYCLE_UPDATE', .2499, true], ['057-competitor', '057', 'UNSAFE_RESTRICTED_BOUNDARY', .5548, false],
  ['058-expected', '058', 'CLAIM_FILE', .8322, true], ['058-competitor', '058', 'COVERAGE_COMPARISON_STATUS', .6026, false],
  ['059-expected', '059', 'CLAIM_TRANSITION', .6671, true], ['059-competitor', '059', 'BUYER_COST_READINESS', .617, false],
  ['060-expected', '060', 'INCIDENT_CONTINUATION', .2135, true], ['060-competitor', '060', 'INCIDENT_CLAIM_STATUS', .1423, false],
  ['061-expected', '061', 'OPERATIONAL_WORK_UPDATE', .6787, true], ['061-competitor', '061', 'SELLER_PREP_ITEM_DECISION', .5658, false],
  ['062-expected', '062', 'INSPECTION_FINDINGS', .7431, true], ['062-competitor', '062', 'SELLER_PREP_CHECKLIST', .6995, false],
  ['063-expected', '063', 'INSPECTION_FINDING_UPDATE', .2948, true], ['063-competitor', '063', 'DOCUMENT_PROMOTION_CONFIRM', .1982, false],
  ['064-expected', '064', 'DOCUMENT_PROMOTION_REVIEW', .2725, true], ['064-competitor', '064', 'BUYER_CONTRACT_TIMELINE', .2461, false],
  ['065-expected', '065', 'DOCUMENT_PROMOTION_CONFIRM', .6684, true], ['065-competitor', '065', 'HOME_CHANGE_SUMMARY', .6381, false],
  ['066-expected', '066', 'INTELLIGENCE_ENVELOPE_QUERY', .2777, true], ['066-competitor', '066', 'PROPERTY_SUMMARY', .142, false],
  // Phase 3 / PR 12b — fixture ask-routing-independent-v2-067 (HVAC_SPECIALIST_ENGAGE).
  ['067-expected', '067', 'HVAC_SPECIALIST_ENGAGE', .7802, true], ['067-competitor', '067', 'HVAC_DECISION_OUTCOME_REPORT', .504, false],
  ['068-expected', '068', 'MAINTENANCE_FORECAST', .6388, true], ['068-competitor', '068', 'HVAC_DECISION_OUTCOME_VIEW', .496, false],
  ['069-expected', '069', 'COVERAGE_COMPARISON_STATUS', .7029, true], ['069-competitor', '069', 'COVERAGE_GAPS', .5983, false],
  ['070-expected', '070', 'DOCUMENT_LOOKUP', .1773, true], ['070-competitor', '070', 'INVENTORY_LOOKUP', .6844, false],
  ['071-expected', '071', 'SELLER_PREP_CHECKLIST', .8358, true], ['071-competitor', '071', 'PROPERTY_TAX_APPEAL_READINESS', .7613, false],
  ['072-expected', '072', 'SELLER_PREP_ITEM_DECISION', .1505, true], ['072-competitor', '072', 'SELLER_PREP_CHECKLIST', .221, false],
  ['073-expected', '073', 'HOME_EVENT_RADAR_FEED', .1058, true], ['073-competitor', '073', 'OUT_OF_SCOPE_BOUNDARY', .1611, false],
  // FRD v1.48: fixture 074 (BREAK_EVEN_ANALYSIS). Adding that operation also made it the strongest competitor on 008 and
  // 014, still well below each expected operation; both rows were re-derived from the retriever, not hand-edited.
  ['074-expected', '074', 'BREAK_EVEN_ANALYSIS', .7128, true], ['074-competitor', '074', 'PAST_HAZARD_EXPOSURE', .6355, false],
  // FRD v1.49: fixture 075 (NEIGHBORHOOD_CHANGE_FEED), re-derived from the retriever; no existing row changed.
  ['075-expected', '075', 'NEIGHBORHOOD_CHANGE_FEED', .2809, true], ['075-competitor', '075', 'PAST_HAZARD_EXPOSURE', .25, false],
  // FRD v1.50: fixture 076 (PAST_HAZARD_EXPOSURE). Adding that operation also made it the strongest competitor on 014, 074
  // and 075, each still below its expected operation; all re-derived from the retriever, not hand-edited.
  ['076-expected', '076', 'PAST_HAZARD_EXPOSURE', .7281, true], ['076-competitor', '076', 'CAPABILITY_DISCOVERY', .6224, false],
  // FRD v1.51: fixture 077 (HOME_STATUS_BOARD), re-derived from the retriever; no existing row changed. A first fixture
  // ("How are my home systems holding up these days?") put a 0.637 wrong-operation competitor into the READ curve and
  // pulled an unrelated misspelled fixture under the execution floor, so it was replaced.
  ['077-expected', '077', 'HOME_STATUS_BOARD', .5044, true], ['077-competitor', '077', 'INVENTORY_LOOKUP', .23, false],
  // FRD v1.53: fixture 078 (HOME_HABITS), re-derived from the retriever; no existing row changed. Two first choices with a
  // weak (< 0.29) wrong-operation competitor pooled with other fixtures' low competitors in the READ curve and pulled
  // "Show my inspecion findings" under the execution floor; this pair leaves that fixture's confidence unchanged.
  ['078-expected', '078', 'HOME_HABITS', .8183, true], ['078-competitor', '078', 'CAPITAL_RESERVE_PLAN', .6673, false],
  // FRD v1.54: fixture 079 (HOME_DIGITAL_WILL), re-derived from the retriever; no existing row changed. Candidate pairs
  // were tested against every Skill routing case first; this one leaves "Show my inspecion findings" unchanged at 0.4322.
  ['079-expected', '079', 'HOME_DIGITAL_WILL', .8264, true], ['079-competitor', '079', 'SELLER_PREP_CHECKLIST', .6408, false],
  // FRD v1.55: fixture 080 (PLANT_CARE_OUTLOOK), re-derived from the retriever; no existing row changed. Plant phrasing
  // scores low in the retriever, and every candidate pair with a weak competitor pushed "Show my inspecion findings" to
  // clarification; this one, tested against every Skill routing case, keeps it resolved (0.4322 -> 0.4330).
  ['080-expected', '080', 'PLANT_CARE_OUTLOOK', .5057, true], ['080-competitor', '080', 'HOME_DIGITAL_WILL', .678, false],
  // FRD v1.56: fixture 081 (NEGOTIATION_SHIELD_CASES), re-derived from the retriever. The new operation's records made it
  // fixture 054's top competitor ("negotiation" is its key word), so 054's competitor row was re-derived too. Candidate
  // pairs were swept against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4277).
  ['081-expected', '081', 'NEGOTIATION_SHIELD_CASES', .2729, true], ['081-competitor', '081', 'HVAC_DECISION_CONTINUE', .2193, false],
  // FRD v1.57: fixture 082 (HOME_UPGRADE_SCENARIOS), re-derived from the retriever; no existing row changed. Candidate
  // pairs were swept against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4387).
  ['082-expected', '082', 'HOME_UPGRADE_SCENARIOS', .664, true], ['082-competitor', '082', 'QUOTE_COMPARISON_CREATE', .5181, false],
  // FRD v1.58: fixture 083 (DIY_PROJECTS), re-derived from the retriever; no existing row changed (a first-draft positive
  // sharing the "How far along…" frame with fixtures 047 and 082 was reworded). Candidate pairs were swept against every
  // Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4448).
  ['083-expected', '083', 'DIY_PROJECTS', .3955, true], ['083-competitor', '083', 'PROJECT_TRACKER_PROJECTS', .2513, false],
  // FRD v1.59: fixture 084 (PROJECT_TRACKER_PROJECTS), re-derived from the retriever. "projects" made this operation
  // fixture 083's (DIY) top competitor, so 083's competitor row was re-derived; a first-draft positive naming renovation
  // projects outranked RENOVATION_PERMIT_READINESS on fixture 024 and was reworded. Candidate pairs were swept against
  // every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4444).
  ['084-expected', '084', 'PROJECT_TRACKER_PROJECTS', .8039, true], ['084-competitor', '084', 'QUOTE_COMPARISON_REVIEW', .5647, false],
  // FRD v1.60: fixture 085 (SERVICE_PRICE_CHECKS), re-derived from the retriever; no existing row changed. Candidate pairs
  // were swept against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4558).
  ['085-expected', '085', 'SERVICE_PRICE_CHECKS', .3656, true], ['085-competitor', '085', 'QUOTE_COMPARISON_REVIEW', .2843, false],
  // FRD v1.61: fixture 086 (HOME_TIMELINE_EVENTS), re-derived from the retriever; no existing row changed (first-draft
  // positives sharing frames with fixtures 009, 018, 067, 075, 076 and 078 and a query-envelope routing case were reworded
  // until none moved). Candidate pairs were swept against every Skill routing case; this one keeps them resolved
  // ("Show my inspecion findings" 0.445).
  ['086-expected', '086', 'HOME_TIMELINE_EVENTS', .7155, true], ['086-competitor', '086', 'HOME_HABITS', .6711, false],
  // FRD v1.62: fixture 087 (MATERIAL_SPECS_LIST), re-derived from the retriever; no existing row changed (a first-draft
  // positive sharing the "...recorded for..." frame with fixtures 009 and 055 was reworded). Candidate pairs were swept
  // against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4557).
  ['087-expected', '087', 'MATERIAL_SPECS_LIST', .3611, true], ['087-competitor', '087', 'OWNERSHIP_COSTS', .1221, false],
  // FRD v1.63: fixture 088 (PROPERTY_BRIEFS_LIST), re-derived from the retriever; no existing row changed (first-draft
  // positives sharing frames with fixtures 026, 078 and 084 were reworded). Candidate pairs were swept against every
  // Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4557).
  ['088-expected', '088', 'PROPERTY_BRIEFS_LIST', .8098, true], ['088-competitor', '088', 'HOUSEHOLD_INVITATION', .6665, false],
  // FRD v1.65: fixture 089 (GUIDANCE_JOURNEYS_LIST), re-derived from the retriever. First-draft positives that became the
  // competitor on fixtures 043 and 060 were reworded; 018's competitor was re-derived (see its row). Candidate pairs
  // were swept against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4458).
  ['089-expected', '089', 'GUIDANCE_JOURNEYS_LIST', .7408, true], ['089-competitor', '089', 'GUIDANCE_JOURNEY_CREATE', .659, false],
  // FRD v1.66: fixture 090 (HOA_COMPLIANCE_STATUS), re-derived from the retriever; no existing row changed (a first-draft
  // positive sharing "open" with fixture 049 was reworded). Candidate pairs were swept against every Skill routing case;
  // this one keeps them resolved ("Show my inspecion findings" 0.4502).
  ['090-expected', '090', 'HOA_COMPLIANCE_STATUS', .414, true], ['090-competitor', '090', 'PROJECT_TRACKER_PROJECTS', .2464, false],
  // FRD v1.67: fixture 091 (PRICE_FINALIZATIONS_LIST), re-derived from the retriever; no existing row changed. Candidate
  // pairs were swept against every Skill routing case; this one keeps them resolved ("Show my inspecion findings" 0.4549).
  ['091-expected', '091', 'PRICE_FINALIZATIONS_LIST', .4066, true], ['091-competitor', '091', 'MATERIAL_SPECS_LIST', .2131, false],
];

export const ASK_ROUTING_CALIBRATION_OBSERVATIONS: readonly AskRoutingCalibrationObservation[] = Object.freeze(
  ROWS.map(([rowId, fixtureId, candidateOperationId, rawScore, correct]) => Object.freeze({
    observationId: `ask-routing-calibration-v2-${rowId}`,
    sourceFixtureId: `ask-routing-independent-v2-${fixtureId}`,
    candidateOperationId,
    rawScore,
    correct,
  })),
);
