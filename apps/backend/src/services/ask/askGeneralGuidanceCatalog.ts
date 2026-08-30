export interface AskGeneralGuidanceEntry {
  id: string;
  title: string;
  guidance: string;
  keywords: readonly string[];
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
  },
  {
    id: 'gutter-inspection-frequency',
    title: 'Gutter inspection and cleaning',
    keywords: ['gutter', 'gutters', 'downspout', 'downspouts', 'clean', 'cleaning'],
    guidance: 'Inspect gutters and downspouts at least in spring and fall and after major storms. Homes under heavy tree cover may need more frequent checks. Clear visible debris, confirm downspouts discharge away from the foundation, and avoid unsafe ladder work.',
  },
  {
    id: 'hvac-filter-frequency',
    title: 'HVAC filter checks',
    keywords: ['hvac', 'furnace', 'heater', 'filter', 'filters', 'air conditioner'],
    guidance: 'Check the HVAC filter about monthly during heavy heating or cooling use and replace it when dirty or according to the equipment and filter manufacturer. Pets, construction dust, smoke, and high system usage can shorten the interval.',
  },
  {
    id: 'smoke-co-alarm-care',
    title: 'Smoke and carbon-monoxide alarm care',
    keywords: ['smoke', 'carbon monoxide', 'alarm', 'alarms', 'detector', 'detectors'],
    guidance: 'Test smoke and carbon-monoxide alarms regularly using the manufacturer instructions, replace batteries when indicated, and replace expired units according to their marked service life. Treat an active carbon-monoxide alarm or symptoms as an emergency: leave the building and contact emergency services.',
  },
  {
    id: 'water-heater-maintenance',
    title: 'Water-heater maintenance basics',
    keywords: ['water heater', 'waterheater', 'tank', 'sediment', 'flush'],
    guidance: 'Inspect a water heater periodically for leaks, corrosion, unusual sounds, and venting problems. Follow the manufacturer guidance for sediment flushing and anode inspection; shut down the unit and contact a qualified professional if leaking water, combustion problems, or unsafe venting is suspected.',
  },
  {
    id: 'roof-observation',
    title: 'Routine roof observation',
    keywords: ['roof', 'roofing', 'shingle', 'shingles', 'flashing'],
    guidance: 'Observe the roof from the ground and check the attic or upper ceilings for leaks after major storms. Missing materials, damaged flashing, active leakage, or sagging warrants professional inspection. Avoid walking on a roof unless you are trained and equipped to do so safely.',
  },
  {
    id: 'sump-pump-check',
    title: 'Sump-pump readiness',
    keywords: ['sump', 'pump', 'backup', 'pit'],
    guidance: 'Check that the sump pit is clear, the discharge path is unobstructed, and the pump and any backup power source operate according to manufacturer instructions. Test before wet seasons and address repeated cycling or failure with a qualified professional.',
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
