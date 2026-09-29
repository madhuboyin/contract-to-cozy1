// Home Action focused-guidance CTA fix, Group B (gap audit §17; FRD v1.157+).
// Ports the deterministic age/system checklist content the traditional
// /dashboard/properties/[id]/focus/health/[factor] page computes client-side
// (apps/frontend/.../focus/health/[factor]/page.tsx: getAgeTier,
// getAgeChecklistItems, getSystemKind, getSystemAgeTier,
// getSystemChecklistItems) so a Home Action focused-guidance answer can
// render the same checklist inline in Ask instead of only linking out to it.
//
// This is a deliberate content duplication: the frontend and backend are
// separate npm projects with no shared package, so there is no import path
// that keeps one source of truth. Wording here is copied verbatim from the
// frontend page at the time this was written -- if that page's checklist
// copy changes, this file needs the matching update or the two surfaces will
// drift. Only the two factor families reachable through a Home Action card
// are ported: Property Age (Year Built) and the three system-age factors
// the health score actually emits (HVAC Age, Water Heater Age, Roof Age).
// Electrical panel age is NOT ported -- calculateHealthScore()
// (propertyScore.util.ts) never emits an "Electrical Panel Age" factor, so
// the frontend page's electrical-panel branch is unreachable from any Home
// Action card and porting it would be dead duplicated content.

export type ChecklistUrgency = 'act' | 'review' | 'watch';

export type HealthFactorChecklistItem = {
  id: string;
  system: string;
  ageNote: string;
  action: string;
  urgency: ChecklistUrgency;
};

export function urgencyLabel(urgency: ChecklistUrgency): string {
  return { act: 'Act now', review: 'Review soon', watch: 'Monitor' }[urgency];
}

// ── Property age checklist (isPropertyAgeFactor) ────────────────────────────

type AgeTier = 'new' | 'young' | 'mid' | 'mature' | 'senior';

function getAgeTier(age: number): AgeTier {
  if (age < 10) return 'new';
  if (age < 20) return 'young';
  if (age < 35) return 'mid';
  if (age < 50) return 'mature';
  return 'senior';
}

export function isPropertyAgeFactor(factor: string | undefined | null): boolean {
  const f = String(factor || '').toLowerCase();
  return f.includes('age factor') || f.includes('property age') || f.includes('year built');
}

function getAgeChecklistItems(
  age: number,
  knownSystems: {
    hvacInstallYear?: number | null;
    waterHeaterInstallYear?: number | null;
    roofReplacementYear?: number | null;
  },
): HealthFactorChecklistItem[] {
  const currentYear = new Date().getFullYear();
  const tier = getAgeTier(age);
  const items: HealthFactorChecklistItem[] = [];

  if (tier === 'new') {
    items.push(
      {
        id: 'builder-warranty', system: 'Builder warranty',
        ageNote: 'New homes typically have a 1-year workmanship and 10-year structural warranty.',
        action: 'Verify your builder warranty is registered and active before it expires.',
        urgency: 'review',
      },
      {
        id: 'appliance-registration', system: 'Appliance warranties',
        ageNote: 'Manufacturer warranties on new appliances run 1–5 years from purchase.',
        action: 'Register all appliances with manufacturers to activate warranty coverage.',
        urgency: 'act',
      },
      {
        id: 'hvac-filter', system: 'HVAC filter',
        ageNote: 'First filter replacement is often missed during new-home move-in.',
        action: 'Replace HVAC air filter every 3 months; set a recurring reminder.',
        urgency: 'watch',
      },
    );
  }

  if (tier === 'young') {
    items.push(
      {
        id: 'hvac-service', system: 'HVAC',
        ageNote: `At ${age} years, your original HVAC system may be approaching its first major service interval.`,
        action: 'Schedule a full HVAC inspection and filter/belt/coil service — typically $80–150.',
        urgency: 'review',
      },
      {
        id: 'roof-mid', system: 'Roof',
        ageNote: 'Asphalt shingle roofs hit mid-life around 10–15 years — a good time to check condition.',
        action: 'Walk the attic and check for granule loss in gutters. Book an inspection if unsure.',
        urgency: 'watch',
      },
      {
        id: 'water-heater-anode', system: 'Water heater',
        ageNote: 'Anode rods protect tanks from corrosion and should be inspected every 5 years.',
        action: 'Have a plumber check and replace the anode rod if needed — typically $50–100.',
        urgency: 'review',
      },
      {
        id: 'caulking', system: 'Seals & weatherstripping',
        ageNote: 'Caulking and seals around windows, doors, and tubs dry out in the first decade.',
        action: 'Inspect and re-caulk any cracked or pulling seals to prevent water intrusion.',
        urgency: 'watch',
      },
    );
  }

  if (tier === 'mid') {
    const hvacAge = knownSystems.hvacInstallYear ? currentYear - knownSystems.hvacInstallYear : null;
    const hvacUrgency: ChecklistUrgency = hvacAge && hvacAge > 15 ? 'act' : 'review';
    items.push(
      {
        id: 'hvac-replacement', system: 'HVAC',
        ageNote: hvacAge
          ? `Your HVAC is ${hvacAge} years old. Typical lifespan is 15–20 years.`
          : "HVAC systems have a typical lifespan of 15–20 years — assess your current system's age.",
        action: 'Get a service inspection and ask the technician for an honest remaining-life assessment.',
        urgency: hvacUrgency,
      },
      {
        id: 'water-heater-replacement', system: 'Water heater',
        ageNote: knownSystems.waterHeaterInstallYear
          ? `Installed ${currentYear - knownSystems.waterHeaterInstallYear} years ago. Tank water heaters last 10–15 years.`
          : 'Tank water heaters typically last 10–15 years — check installation date.',
        action: 'If over 12 years old, get a plumber assessment and start comparing replacement costs.',
        urgency: 'review',
      },
      {
        id: 'roof-inspection', system: 'Roof',
        ageNote: knownSystems.roofReplacementYear
          ? `Roof replaced ${currentYear - knownSystems.roofReplacementYear} years ago. Asphalt shingles last 20–30 years.`
          : 'At this home age, the roof may be approaching its replacement window.',
        action: 'Book a roof inspection — many contractors do this free. Get a written report.',
        urgency: 'review',
      },
      {
        id: 'polybutylene', system: 'Plumbing',
        ageNote: 'Homes built 1978–1995 may have polybutylene pipes, which are prone to failure and were subject to class action recalls.',
        action: 'Have a plumber identify your pipe material. If polybutylene, budget for re-piping ($4,000–15,000).',
        urgency: 'act',
      },
      {
        id: 'electrical-panel', system: 'Electrical panel',
        ageNote: 'Breaker panels from this era may have known issues. Older panels can also lack arc-fault protection.',
        action: 'Have a licensed electrician inspect the panel and confirm it meets current safety standards.',
        urgency: 'review',
      },
    );
  }

  if (tier === 'mature') {
    items.push(
      {
        id: 'electrical-panel-mature', system: 'Electrical panel',
        ageNote: 'Homes this age may have Federal Pacific or Zinsco panels — both known safety hazards with documented fire risks.',
        action: 'Have an electrician identify your panel brand. Federal Pacific and Zinsco panels should be replaced.',
        urgency: 'act',
      },
      {
        id: 'galvanized-plumbing', system: 'Plumbing',
        ageNote: 'Galvanized steel pipes common in pre-1980 homes corrode from the inside, reducing water pressure and quality.',
        action: 'Have a plumber assess pipe material and corrosion level. Budget for re-piping if galvanized.',
        urgency: 'act',
      },
      {
        id: 'lead-paint', system: 'Lead paint',
        ageNote: 'Homes built before 1978 commonly contain lead-based paint, especially on trim, windows, and doors.',
        action: 'Test with an EPA-certified lead paint test kit ($30). Critical if children are present or renovations planned.',
        urgency: 'act',
      },
      {
        id: 'hvac-mature', system: 'HVAC',
        ageNote: knownSystems.hvacInstallYear
          ? `Your HVAC was installed in ${knownSystems.hvacInstallYear} (${currentYear - knownSystems.hvacInstallYear} years ago).`
          : 'A mature home has likely had 2 HVAC systems — confirm the current system’s age.',
        action: 'If the current system is over 12 years old, start getting replacement quotes now before an emergency forces a rushed decision.',
        urgency: 'review',
      },
      {
        id: 'foundation-mature', system: 'Foundation',
        ageNote: 'Settlement cracks are common in homes after 35+ years. Most are cosmetic, but some indicate active movement.',
        action: 'Walk the basement or crawlspace. Cracks wider than 1/4 inch or showing displacement need a structural engineer review.',
        urgency: 'watch',
      },
      {
        id: 'insulation-mature', system: 'Insulation',
        ageNote: 'Pre-1980 insulation is often inadequate by today’s standards and may include outdated materials.',
        action: 'Get an energy audit ($100–400) — it will identify insulation gaps and calculate the ROI on upgrades.',
        urgency: 'watch',
      },
      {
        id: 'windows-mature', system: 'Windows & doors',
        ageNote: 'Original single-pane windows from this era lose significantly more heat than modern double-pane glass.',
        action: 'Check for drafts and fogging between panes. An energy audit will quantify the savings from upgrading.',
        urgency: 'watch',
      },
    );
  }

  if (tier === 'senior') {
    items.push(
      {
        id: 'knob-tube', system: 'Electrical wiring',
        ageNote: 'Homes 50+ years old may still have knob-and-tube wiring — a serious fire and insurance hazard.',
        action: 'Have a licensed electrician inspect for knob-and-tube wiring. Replace if found before insulating walls.',
        urgency: 'act',
      },
      {
        id: 'asbestos', system: 'Asbestos',
        ageNote: 'Pre-1980 construction commonly used asbestos in floor tiles, pipe insulation, ceiling tiles, and joint compound.',
        action: 'Test before any renovation that disturbs these materials. Hire a certified asbestos inspector ($250–500).',
        urgency: 'act',
      },
      {
        id: 'cast-iron-drains', system: 'Drain pipes',
        ageNote: 'Cast iron drain pipes corrode and crack after 50+ years, causing slow drains and leaks inside walls.',
        action: 'Request a drain camera inspection ($150–300). Re-piping cost varies widely by scope ($3,000–20,000).',
        urgency: 'review',
      },
      {
        id: 'electrical-panel-senior', system: 'Electrical panel',
        ageNote: 'Panels this age are frequently undersized for modern loads and may predate current safety standards.',
        action: 'Have an electrician do a full service evaluation. Plan for a panel upgrade ($1,500–4,000) if over 60 amps.',
        urgency: 'act',
      },
      {
        id: 'structural-senior', system: 'Structural assessment',
        ageNote: '50+ year old homes benefit from a full structural review of foundation, load-bearing walls, and roof framing.',
        action: 'Hire a structural engineer for a whole-home assessment ($500–1,500). Invaluable before any major renovation.',
        urgency: 'review',
      },
      {
        id: 'lead-paint-senior', system: 'Lead paint',
        ageNote: 'Lead paint is virtually guaranteed in homes this age. Any renovation that disturbs painted surfaces needs certified abatement.',
        action: 'Use certified lead-safe contractors for any renovation. Test all surfaces before work begins.',
        urgency: 'act',
      },
    );
  }

  return items;
}

// ── System age checklist (getSystemKind) ─────────────────────────────────────

type SystemKind = 'water-heater' | 'hvac' | 'roof';
type SystemAgeTier = 'new' | 'mid' | 'aging' | 'overdue';

function getSystemKind(factor: string | undefined | null): SystemKind | null {
  const f = String(factor || '').toLowerCase().trim();
  if (f.includes('water heater')) return 'water-heater';
  if (f.includes('hvac')) return 'hvac';
  if (f.includes('roof')) return 'roof';
  return null;
}

function getSystemAgeTier(age: number, kind: SystemKind): SystemAgeTier {
  if (kind === 'water-heater') {
    if (age < 5) return 'new';
    if (age < 10) return 'mid';
    if (age < 15) return 'aging';
    return 'overdue';
  }
  if (kind === 'hvac') {
    if (age < 7) return 'new';
    if (age < 12) return 'mid';
    if (age < 18) return 'aging';
    return 'overdue';
  }
  // roof
  if (age < 10) return 'new';
  if (age < 20) return 'mid';
  if (age < 25) return 'aging';
  return 'overdue';
}

function getSystemChecklistItems(age: number, kind: SystemKind): HealthFactorChecklistItem[] {
  const tier = getSystemAgeTier(age, kind);
  const items: HealthFactorChecklistItem[] = [];

  if (kind === 'water-heater') {
    if (tier === 'new') {
      items.push(
        {
          id: 'wh-register', system: 'Manufacturer warranty',
          ageNote: 'Most water heaters have a 6–12 year tank warranty. Registration is required to activate coverage.',
          action: "Register the water heater on the manufacturer's website to activate warranty coverage.",
          urgency: 'review',
        },
        {
          id: 'wh-anode-reminder', system: 'Anode rod',
          ageNote: 'Anode rods protect tanks from corrosion and should be inspected every 5–6 years.',
          action: 'Set a reminder to have a plumber check the anode rod at year 5.',
          urgency: 'watch',
        },
      );
    } else if (tier === 'mid') {
      items.push(
        {
          id: 'wh-anode-check', system: 'Anode rod inspection',
          ageNote: 'Anode rods deplete over time — a depleted rod means the tank itself begins corroding from the inside.',
          action: 'Have a plumber inspect and replace the anode rod if under 1/2 inch thick — typically $50–100.',
          urgency: 'review',
        },
        {
          id: 'wh-flush', system: 'Sediment flush',
          ageNote: 'Mineral sediment settles at the tank bottom, reducing heating efficiency and accelerating corrosion.',
          action: 'Flush the tank annually — a plumber can do it for $80–150, or DIY by draining a few gallons via the drain valve.',
          urgency: 'watch',
        },
        {
          id: 'wh-trv', system: 'Pressure relief valve',
          ageNote: 'The T&P (temperature & pressure) valve prevents dangerous pressure buildup and must remain functional.',
          action: 'Test the valve annually: briefly lift the lever to confirm it releases water freely. Replace if corroded.',
          urgency: 'watch',
        },
      );
    } else if (tier === 'aging') {
      items.push(
        {
          id: 'wh-inspect-aging', system: 'Inspection now',
          ageNote: `At ${age} years, your water heater is approaching or past its typical 10–15 year lifespan.`,
          action: 'Have a plumber inspect for rust, corrosion, pooling water, and pilot issues — most inspections cost $75–150.',
          urgency: 'act',
        },
        {
          id: 'wh-quotes', system: 'Replacement quotes',
          ageNote: 'Getting quotes before failure gives you time to decide — not react under pressure during an emergency.',
          action: 'Get 2–3 quotes for a tank replacement ($900–2,000 installed) or a tankless upgrade ($2,000–4,500).',
          urgency: 'review',
        },
        {
          id: 'wh-shutoff-aging', system: 'Shutoff valve location',
          ageNote: 'Know where the cold water shutoff is above the tank before a leak forces you to find it in an emergency.',
          action: 'Locate and test the shutoff valve. Confirm it closes fully without sticking.',
          urgency: 'watch',
        },
      );
    } else {
      items.push(
        {
          id: 'wh-replace-now', system: 'Replace now',
          ageNote: `At ${age} years, your water heater is past its typical lifespan. Failure can cause significant water damage with little warning.`,
          action: 'Schedule replacement immediately. Get 2–3 quotes — typical cost is $900–2,000 installed for a tank unit.',
          urgency: 'act',
        },
        {
          id: 'wh-shutoff-overdue', system: 'Shutoff valve location',
          ageNote: 'Know where the cold water shutoff is before a leak forces you to find it under pressure.',
          action: 'Locate and test the shutoff valve above the tank. Confirm it closes fully.',
          urgency: 'act',
        },
        {
          id: 'wh-tankless', system: 'Tankless upgrade',
          ageNote: 'Tankless water heaters last 20+ years and use 30–40% less energy than traditional tank units.',
          action: 'Ask for a tankless quote alongside a standard tank — long-term savings often justify the premium.',
          urgency: 'review',
        },
      );
    }
  }

  if (kind === 'hvac') {
    if (tier === 'new') {
      items.push(
        {
          id: 'hvac-warranty', system: 'Manufacturer warranty',
          ageNote: 'HVAC systems have 5–10 year parts warranties. Registration is required to activate most of them.',
          action: 'Register the system with the manufacturer and keep a copy of the confirmation for service calls.',
          urgency: 'review',
        },
        {
          id: 'hvac-filter-new', system: 'Filter replacement',
          ageNote: 'A clogged filter reduces airflow, forces the system to work harder, and shortens compressor life.',
          action: "Replace the air filter every 3 months. Set a recurring calendar reminder so it doesn't slip.",
          urgency: 'watch',
        },
        {
          id: 'hvac-annual-new', system: 'Annual tune-up',
          ageNote: 'Annual professional maintenance is often required to keep the manufacturer warranty valid.',
          action: 'Schedule an HVAC tune-up once a year — typically $80–150 for a full inspection and cleaning.',
          urgency: 'watch',
        },
      );
    } else if (tier === 'mid') {
      items.push(
        {
          id: 'hvac-tuneup-mid', system: 'Annual professional tune-up',
          ageNote: 'Mid-life systems benefit most from annual service — coil cleaning and refrigerant checks catch issues early.',
          action: 'Schedule a full tune-up: coil cleaning, refrigerant check, belt and capacitor inspection — $80–150.',
          urgency: 'review',
        },
        {
          id: 'hvac-ducts', system: 'Ductwork leak check',
          ageNote: 'On average, 20–30% of conditioned air is lost through leaky ducts — a hidden efficiency drain.',
          action: 'Ask your HVAC technician to check duct condition and sealing during the next service visit.',
          urgency: 'watch',
        },
        {
          id: 'hvac-thermostat', system: 'Smart thermostat',
          ageNote: "If still using a basic programmable thermostat, upgrading can cut HVAC costs by 10–15%.",
          action: "Consider installing a smart thermostat ($150–300 installed) if you haven't already.",
          urgency: 'watch',
        },
      );
    } else if (tier === 'aging') {
      items.push(
        {
          id: 'hvac-lifespan-assess', system: 'Remaining life assessment',
          ageNote: `At ${age} years, your HVAC is approaching the end of its typical 15–20 year lifespan.`,
          action: 'Schedule a full inspection and ask the technician for an honest remaining-life estimate.',
          urgency: 'act',
        },
        {
          id: 'hvac-quotes-aging', system: 'Replacement quotes',
          ageNote: 'Getting quotes now lets you choose a system on your timeline — not react during a summer breakdown.',
          action: 'Get 2–3 replacement quotes — average HVAC replacement runs $5,000–12,000 installed.',
          urgency: 'review',
        },
        {
          id: 'hvac-seer', system: 'Efficiency comparison',
          ageNote: 'Systems this age may be 10–12 SEER. Modern units (18–20 SEER) use 30–50% less energy.',
          action: 'Ask for SEER ratings in replacement quotes — factor in energy savings when comparing payback periods.',
          urgency: 'watch',
        },
      );
    } else {
      items.push(
        {
          id: 'hvac-replace-now', system: 'Plan replacement immediately',
          ageNote: `At ${age} years, your HVAC is past its typical lifespan. Parts may be scarce and failure risk is high.`,
          action: "Get 3 quotes for replacement now — don't wait for a breakdown in peak summer or winter.",
          urgency: 'act',
        },
        {
          id: 'hvac-emergency-fund', system: 'Emergency fund',
          ageNote: 'Unexpected HVAC failures in extreme weather force rushed decisions at premium prices.',
          action: 'Ensure you have funds for emergency replacement — average cost is $5,000–12,000 installed.',
          urgency: 'act',
        },
        {
          id: 'hvac-heat-pump', system: 'Heat pump option',
          ageNote: 'Modern heat pumps provide both heating and cooling, and often qualify for federal IRA tax credits.',
          action: 'Ask for a heat pump quote alongside a traditional system — available tax credits may offset the premium.',
          urgency: 'review',
        },
      );
    }
  }

  if (kind === 'roof') {
    if (tier === 'new') {
      items.push(
        {
          id: 'roof-gutters-new', system: 'Gutter maintenance',
          ageNote: 'Clogged gutters back water up under shingles, causing premature rot and early leak points.',
          action: 'Clean gutters at least twice a year. Confirm downspouts direct water at least 6 feet from the foundation.',
          urgency: 'watch',
        },
        {
          id: 'roof-flashing-new', system: 'Flashing inspection',
          ageNote: 'Metal flashing around chimneys, vents, and skylights is the most common source of early roof leaks.',
          action: 'Inspect flashing from the ground after major storms. Look for gaps, lifting, or rust streaks.',
          urgency: 'watch',
        },
      );
    } else if (tier === 'mid') {
      items.push(
        {
          id: 'roof-granules', system: 'Granule loss inspection',
          ageNote: 'Granule loss from shingles signals UV protection is degrading — a normal mid-life wear indicator.',
          action: 'Check gutters after rain for shingle granules. Bald patches on shingles need a professional look.',
          urgency: 'review',
        },
        {
          id: 'roof-attic', system: 'Attic inspection',
          ageNote: 'Early water intrusion shows as dark staining, wet insulation, or daylight in the attic — well before ceiling damage.',
          action: 'Inspect the attic after heavy rain. Check for wet spots, dark streaks, or visible light through the decking.',
          urgency: 'review',
        },
        {
          id: 'roof-inspection-mid', system: 'Professional inspection',
          ageNote: 'Many roofing contractors offer free visual inspections. A written report is useful for insurance records.',
          action: 'Book a free professional inspection and request a written condition report for your property file.',
          urgency: 'watch',
        },
      );
    } else if (tier === 'aging') {
      items.push(
        {
          id: 'roof-inspect-aging', system: 'Professional inspection now',
          ageNote: `At ${age} years, your roof is approaching or past the typical 20–30 year asphalt shingle lifespan.`,
          action: 'Get a professional inspection — many contractors offer free assessments with a written condition report.',
          urgency: 'act',
        },
        {
          id: 'roof-quotes', system: 'Replacement budget',
          ageNote: 'Planning ahead lets you choose timing and materials — not react during an active leak or insurance claim.',
          action: 'Get 2–3 replacement quotes — asphalt shingles typically run $8,000–20,000 depending on size and pitch.',
          urgency: 'review',
        },
        {
          id: 'roof-insulation', system: 'Insulation & ventilation',
          ageNote: 'Roof replacement is the ideal time to address attic insulation and ventilation — often bundled together.',
          action: 'Ask roofing contractors to assess insulation and ventilation as part of the replacement estimate.',
          urgency: 'watch',
        },
      );
    } else {
      items.push(
        {
          id: 'roof-replace-now', system: 'Get replacement quotes now',
          ageNote: `At ${age} years, your roof is past its expected lifespan. Don't wait for an active leak to force a rushed decision.`,
          action: 'Get 2–3 replacement quotes immediately — roofing prices vary significantly by contractor.',
          urgency: 'act',
        },
        {
          id: 'roof-active-leaks', system: 'Check for active leaks',
          ageNote: 'Past-lifespan roofs can develop slow leaks that grow quietly — catching them early limits interior damage costs.',
          action: 'Inspect the attic after every major rain. Wet insulation or dark staining means water is already entering.',
          urgency: 'act',
        },
        {
          id: 'roof-insurance', system: 'Insurance policy check',
          ageNote: "Some homeowner policies reduce coverage or require replacement once a roof exceeds a certain age.",
          action: "Contact your insurer to confirm your roof's current coverage status and any replacement requirements.",
          urgency: 'review',
        },
      );
    }
  }

  return items;
}

// ── Unified entry point ──────────────────────────────────────────────────────

export type HealthFactorChecklistProperty = {
  yearBuilt?: number | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
};

/**
 * Resolves the age/system checklist for a health-insight factor, or null
 * when the factor has no checklist content (matches the traditional page's
 * own gating: no checklist section renders without the underlying year).
 */
export function resolveHealthFactorChecklist(
  factor: string | undefined | null,
  property: HealthFactorChecklistProperty,
): { title: string; items: HealthFactorChecklistItem[] } | null {
  const currentYear = new Date().getFullYear();

  if (isPropertyAgeFactor(factor)) {
    if (property.yearBuilt == null) return null;
    const age = currentYear - property.yearBuilt;
    const items = getAgeChecklistItems(age, {
      hvacInstallYear: property.hvacInstallYear,
      waterHeaterInstallYear: property.waterHeaterInstallYear,
      roofReplacementYear: property.roofReplacementYear,
    });
    return items.length ? { title: 'Age-related checklist', items } : null;
  }

  const kind = getSystemKind(factor);
  if (!kind) return null;
  const installYear = kind === 'water-heater' ? property.waterHeaterInstallYear
    : kind === 'hvac' ? property.hvacInstallYear
      : property.roofReplacementYear;
  if (installYear == null) return null;
  const age = currentYear - installYear;
  const items = getSystemChecklistItems(age, kind);
  const label = kind === 'water-heater' ? 'water heater' : kind === 'hvac' ? 'HVAC system' : 'roof';
  return items.length ? { title: `Checklist for your ${label}`, items } : null;
}
