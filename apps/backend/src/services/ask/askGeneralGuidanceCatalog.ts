import { GUIDANCE_ROLES, type GuidanceGovernance } from './askGeneralGuidanceGovernance';

export interface AskGeneralGuidanceEntry {
  id: string;
  title: string;
  guidance: string;
  keywords: readonly string[];
  /** BICC-ANS-014: ownership, evidence basis, scope, exclusions, boundary, review state and dates. */
  governance?: GuidanceGovernance;
}

/**
 * Code-owned, reviewable educational guidance used only when no property is
 * selected. Entries are intentionally bounded and never make a diagnosis,
 * code-compliance determination, or property-specific claim.
 */
export const ASK_GENERAL_GUIDANCE_CATALOG: readonly AskGeneralGuidanceEntry[] = Object.freeze([
  {
    id: 'basement-dampness-causes',
    title: 'Common causes of basement dampness',
    keywords: ['basement', 'damp', 'dampness', 'moisture', 'wet', 'seepage'],
    guidance: 'Basement dampness commonly comes from exterior drainage or grading, blocked gutters or downspouts, plumbing leaks, groundwater seepage, or condensation. Identify the moisture source before choosing a repair, and use a qualified professional when water is persistent, structural movement is visible, or electrical equipment may be affected.',
    governance: {
      topicFamily: 'moisture-and-water', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Moisture and drainage basics: Drainage, grading and moisture-source identification in general terms.", exclusions: ["diagnosing a specific basement", "mold remediation", "structural assessment"],
      boundary: "Persistent moisture, mold, or structural signs need a qualified professional.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'gutter-inspection-frequency',
    title: 'Gutter inspection and cleaning',
    keywords: ['gutter', 'gutters', 'downspout', 'downspouts', 'clean', 'cleaning'],
    guidance: 'Inspect gutters and downspouts at least in spring and fall and after major storms. Homes under heavy tree cover may need more frequent checks. Clear visible debris, confirm downspouts discharge away from the foundation, and avoid unsafe ladder work.',
    governance: {
      topicFamily: 'seasonal-exterior-care', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Gutter and downspout routine care: General inspection cadence.", exclusions: ["roof or fascia repair", "structural assessment"],
      boundary: "Work at height and storm damage need appropriate safety measures or a professional.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'hvac-filter-frequency',
    title: 'HVAC filter checks',
    keywords: ['hvac', 'furnace', 'heater', 'filter', 'filters', 'air conditioner'],
    guidance: 'Check the HVAC filter about monthly during heavy heating or cooling use and replace it when dirty or according to the equipment and filter manufacturer. Pets, construction dust, smoke, and high system usage can shorten the interval.',
    governance: {
      topicFamily: 'hvac-basics', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Filter check cadence: General filter checking.", exclusions: ["equipment diagnosis", "efficiency or warranty determinations"],
      boundary: "Follow the equipment and filter manufacturer instructions.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'smoke-co-alarm-care',
    title: 'Smoke and carbon-monoxide alarm care',
    keywords: ['smoke', 'carbon monoxide', 'alarm', 'alarms', 'detector', 'detectors'],
    guidance: 'Test smoke and carbon-monoxide alarms regularly using the manufacturer instructions, replace batteries when indicated, and replace expired units according to their marked service life. Treat an active carbon-monoxide alarm or symptoms as an emergency: leave the building and contact emergency services.',
    governance: {
      topicFamily: 'life-safety-alarms', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Alarm testing and replacement basics: General alarm care.", exclusions: ["an active alarm or emergency", "installation code requirements"],
      boundary: "An alarm sounding or a suspected leak is an emergency: leave and call emergency services.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'water-heater-maintenance',
    title: 'Water-heater maintenance basics',
    keywords: ['water heater', 'waterheater', 'tank', 'sediment', 'flush'],
    guidance: 'Inspect a water heater periodically for leaks, corrosion, unusual sounds, and venting problems. Follow the manufacturer guidance for sediment flushing and anode inspection; shut down the unit and contact a qualified professional if leaking water, combustion problems, or unsafe venting is suspected.',
    governance: {
      topicFamily: 'plumbing-and-water-heating', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Routine water-heater observation: General inspection and flushing guidance.", exclusions: ["gas or electrical repair", "a specific unit diagnosis"],
      boundary: "Gas, venting, leak and shutdown concerns need a qualified professional.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'roof-observation',
    title: 'Routine roof observation',
    keywords: ['roof', 'roofing', 'shingle', 'shingles', 'flashing'],
    guidance: 'Observe the roof from the ground and check the attic or upper ceilings for leaks after major storms. Missing materials, damaged flashing, active leakage, or sagging warrants professional inspection. Avoid walking on a roof unless you are trained and equipped to do so safely.',
    governance: {
      topicFamily: 'seasonal-exterior-care', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Ground-level roof observation: Routine observation.", exclusions: ["roof repair estimates", "storm-damage claims"],
      boundary: "Missing materials, leakage or sagging need a qualified roofer.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
  {
    id: 'sump-pump-check',
    title: 'Sump-pump readiness',
    keywords: ['sump', 'pump', 'backup', 'pit'],
    guidance: 'Check that the sump pit is clear, the discharge path is unobstructed, and the pump and any backup power source operate according to manufacturer instructions. Test before wet seasons and address repeated cycling or failure with a qualified professional.',
    governance: {
      topicFamily: 'moisture-and-water', owner: GUIDANCE_ROLES.owner, evidenceBasis: 'UNRECORDED',
      scope: "Sump-pump readiness checks: General readiness checks.", exclusions: ["pump sizing", "flood damage claims"],
      boundary: "Persistent water entry needs a qualified professional.",
      safetyReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.safetyReviewer, reviewedOn: null },
      editorialReview: { status: 'PENDING', reviewer: GUIDANCE_ROLES.editor, reviewedOn: null },
      lastAuthored: '2026-11-22', nextReview: '2027-05-22',
    },
  },
]);

function normalizedTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

export function selectAskGeneralGuidance(message: string): AskGeneralGuidanceEntry | null {
  const normalized = message.toLowerCase();
  const questionTokens = normalizedTokens(message);
  let best: { entry: AskGeneralGuidanceEntry; score: number } | null = null;
  for (const entry of ASK_GENERAL_GUIDANCE_CATALOG) {
    const score = entry.keywords.reduce((total, keyword) => {
      const phrase = keyword.toLowerCase();
      if (phrase.includes(' ')) return total + (normalized.includes(phrase) ? 2 : 0);
      return total + (questionTokens.has(phrase) ? 1 : 0);
    }, 0);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}
