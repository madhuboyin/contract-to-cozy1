// ---------------------------------------------------------------------------
// Constants — no React or next-navigation imports
// ---------------------------------------------------------------------------

export type AssetScopeOption = {
  key: string;
  assetName: string;
  systemType: string;
  category: string;
  actionCta: string | null;
  outOfPocketCost: number;
  inventoryItemId: string | null;
  homeAssetId: string | null;
};

export const DOMAIN_FOCUS_LABELS: Record<string, string> = {
  ASSET_LIFECYCLE: 'Aging home system',
  MAINTENANCE: 'Home maintenance issue',
  SAFETY: 'Home safety issue',
  INSURANCE: 'Coverage decision',
  FINANCIAL: 'Home expense planning',
  COMPLIANCE: 'Compliance issue',
  WEATHER: 'Weather readiness issue',
  ENERGY: 'Energy cost issue',
  OTHER: 'Home issue',
};

export const SIGNAL_SUBTITLE_LABELS: Record<string, string> = {
  cost_of_inaction_risk: 'Delaying this issue could increase your total cost.',
  coverage_gap: 'Coverage may not protect this issue right now.',
  coverage_lapse_detected: 'Coverage may expire soon for this issue.',
  lifecycle_end_or_past_life: 'This asset is near or past expected life.',
  maintenance_failure_risk: 'This issue can worsen if maintenance is delayed.',
  inspection_followup_needed: 'Inspection follow-up is needed before execution.',
  recall_detected: 'A safety recall may require immediate action.',
  high_utility_cost: 'This issue may be increasing your ongoing utility costs.',
};

// Generic fallback — used when no category-specific list matches
export const SUGGESTED_ISSUE_TYPES_ITEM = [
  { key: 'not_working', label: 'Not working properly' },
  { key: 'past_life', label: 'Aging or past expected life' },
  { key: 'broken', label: 'Broken or damaged' },
  { key: 'inspection_needed', label: 'Needs inspection or maintenance' },
  { key: 'coverage_question', label: 'Coverage or warranty question' },
  { key: 'cost_estimate', label: 'Need a cost estimate' },
];

// Name-based overrides within APPLIANCE — matched by lowercase keyword in asset name.
// Checked before the category-level fallback so "Washer Dryer" gets washer issues,
// not oven/cooking issues.
export const APPLIANCE_ISSUES_BY_NAME: Array<{
  keywords: string[];
  issues: { key: string; label: string }[];
}> = [
  {
    keywords: ['washer', 'dryer', 'washing machine', 'laundry'],
    issues: [
      { key: 'not_working', label: 'Not working properly' },
      { key: 'not_draining', label: 'Not draining or spinning' },
      { key: 'not_drying', label: 'Not drying clothes properly' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'unusual_noise', label: 'Making unusual noise or vibration' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
    ],
  },
  {
    keywords: ['refrigerator', 'fridge', 'freezer'],
    issues: [
      { key: 'not_cooling', label: 'Not cooling or freezing properly' },
      { key: 'ice_maker', label: 'Ice maker or water dispenser not working' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
    ],
  },
  {
    keywords: ['dishwasher'],
    issues: [
      { key: 'not_cleaning', label: 'Not cleaning dishes properly' },
      { key: 'not_draining', label: 'Not draining' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'door_issue', label: 'Door not latching or sealing' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
    ],
  },
  {
    keywords: ['oven', 'range', 'stove', 'cooktop', 'microwave'],
    issues: [
      { key: 'not_working', label: 'Not working properly' },
      { key: 'not_heating', label: 'Not heating or cooking evenly' },
      { key: 'burner_issue', label: 'Burner or element not working' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
    ],
  },
  {
    keywords: ['water heater', 'hot water heater'],
    issues: [
      { key: 'no_hot_water', label: 'No hot water' },
      { key: 'leak', label: 'Leaking or dripping' },
      { key: 'unusual_noise', label: 'Rumbling or unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'high_utility_cost', label: 'Unusually high energy bills' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a replacement cost estimate' },
    ],
  },
];

export function resolveApplianceIssues(assetName: string): { key: string; label: string }[] | null {
  const lower = assetName.toLowerCase();
  for (const entry of APPLIANCE_ISSUES_BY_NAME) {
    if (entry.keywords.some((kw) => lower.includes(kw))) return entry.issues;
  }
  return null;
}

// Per-category issue types — keys match InventoryItemCategory enum values
export const SUGGESTED_ISSUE_TYPES_BY_CATEGORY: Record<string, { key: string; label: string }[]> = {
  APPLIANCE: [
    { key: 'not_working', label: 'Not working properly' },
    { key: 'error_code', label: 'Showing an error code or warning light' },
    { key: 'unusual_noise', label: 'Making unusual noise or vibration' },
    { key: 'broken', label: 'Broken, cracked, or physically damaged' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'coverage_question', label: 'Warranty or coverage question' },
    { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
  ],
  HVAC: [
    { key: 'not_cooling', label: 'Not cooling' },
    { key: 'not_heating', label: 'Not heating' },
    { key: 'poor_airflow', label: 'Poor airflow or uneven temperatures' },
    { key: 'unusual_noise', label: 'Making unusual noise' },
    { key: 'high_utility_cost', label: 'Unusually high energy bills' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'inspection_needed', label: 'Needs seasonal inspection or tune-up' },
    { key: 'coverage_question', label: 'Warranty or coverage question' },
  ],
  PLUMBING: [
    { key: 'leak', label: 'Leaking or dripping' },
    { key: 'low_pressure', label: 'Low water pressure' },
    { key: 'no_hot_water', label: 'No hot water' },
    { key: 'slow_drain', label: 'Slow drain or clog' },
    { key: 'unusual_noise', label: 'Banging or unusual pipe noise' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'inspection_needed', label: 'Needs inspection or maintenance' },
    { key: 'cost_estimate', label: 'Need a cost estimate' },
  ],
  ELECTRICAL: [
    { key: 'not_working', label: 'Not working or no power' },
    { key: 'tripping_breaker', label: 'Tripping circuit breaker' },
    { key: 'flickering', label: 'Flickering lights or power fluctuations' },
    { key: 'outlet_issue', label: 'Outlet or switch not functioning' },
    { key: 'past_life', label: 'Panel or wiring aging or outdated' },
    { key: 'inspection_needed', label: 'Needs safety inspection' },
    { key: 'coverage_question', label: 'Coverage or warranty question' },
    { key: 'cost_estimate', label: 'Need a cost estimate' },
  ],
  ROOF_EXTERIOR: [
    { key: 'leak', label: 'Leaking or water intrusion' },
    { key: 'visible_damage', label: 'Visible damage (missing shingles, dents, cracks)' },
    { key: 'past_life', label: 'Aging or near end of life' },
    { key: 'inspection_needed', label: 'Needs inspection after storm or event' },
    { key: 'gutter_issue', label: 'Gutter or drainage issue' },
    { key: 'coverage_question', label: 'Insurance or warranty question' },
    { key: 'cost_estimate', label: 'Need a repair or replacement estimate' },
  ],
  SAFETY: [
    { key: 'not_working', label: 'Device not working or alarming unexpectedly' },
    { key: 'battery_low', label: 'Low battery or needs replacement' },
    { key: 'past_life', label: 'Past recommended replacement date' },
    { key: 'inspection_needed', label: 'Needs testing or professional inspection' },
    { key: 'coverage_question', label: 'Coverage or warranty question' },
  ],
  SMART_HOME: [
    { key: 'not_working', label: 'Device not responding or offline' },
    { key: 'connectivity_issue', label: 'Connectivity or pairing issue' },
    { key: 'error_code', label: 'Showing an error or fault code' },
    { key: 'past_life', label: 'Outdated or past expected life' },
    { key: 'cost_estimate', label: 'Need a replacement cost estimate' },
  ],
};

export const SUGGESTED_ISSUE_TYPES_BY_SERVICE: Record<string, { key: string; label: string }[]> = {
  warranty_purchase: [
    { key: 'purchase_warranty', label: 'Find and purchase a home warranty' },
    { key: 'compare_warranty_plans', label: 'Compare home warranty plans' },
    { key: 'understand_coverage', label: 'Understand what is covered' },
    { key: 'warranty_renewal', label: 'Renew or extend an existing warranty' },
    { key: 'get_quotes', label: 'Get quotes and compare options' },
  ],
  insurance_purchase: [
    { key: 'purchase_insurance', label: 'Purchase or review home insurance' },
    { key: 'compare_rates', label: 'Compare insurance rates and providers' },
    { key: 'coverage_gap', label: 'Check for coverage gaps' },
    { key: 'policy_renewal', label: 'Renew or update an existing policy' },
    { key: 'get_quotes', label: 'Get quotes and compare options' },
  ],
  general_inspection: [
    { key: 'schedule_inspection', label: 'Schedule a home inspection' },
    { key: 'pre_purchase_inspection', label: 'Pre-purchase or due diligence inspection' },
    { key: 'annual_maintenance', label: 'Annual or seasonal maintenance inspection' },
    { key: 'post_repair_inspection', label: 'Post-repair or contractor inspection' },
    { key: 'get_quotes', label: 'Get quotes and compare inspectors' },
  ],
  cleaning_service: [
    { key: 'arrange_cleaning', label: 'Arrange a regular cleaning service' },
    { key: 'deep_clean', label: 'One-time deep clean' },
    { key: 'move_clean', label: 'Move-in or move-out clean' },
    { key: 'post_construction', label: 'Post-construction or renovation clean-up' },
    { key: 'get_quotes', label: 'Get quotes and compare cleaners' },
  ],
};

// Fallback for any service key not explicitly mapped
export const SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT = [
  { key: 'get_quotes', label: 'Get quotes and compare options' },
  { key: 'schedule_service', label: 'Schedule the service' },
  { key: 'understand_options', label: 'Understand available options' },
];

export const SERVICE_CATEGORIES = [
  { key: 'warranty_purchase', label: 'Home warranty', description: 'Find and purchase a home warranty plan.' },
  { key: 'insurance_purchase', label: 'Home insurance', description: 'Review or purchase home insurance coverage.' },
  { key: 'general_inspection', label: 'Home inspection', description: 'Schedule a professional home inspection.' },
  { key: 'cleaning_service', label: 'Cleaning service', description: 'Arrange a home cleaning or deep clean.' },
];

// FRD-FR-01: Category filter tabs for the ITEM inventory picker.
// Keys match InventoryItemCategory enum values from the Prisma schema.
export const INVENTORY_CATEGORY_TABS: { key: string; label: string }[] = [
  { key: 'ALL',          label: 'All' },
  { key: 'APPLIANCE',    label: 'Appliances' },
  { key: 'HVAC',         label: 'HVAC' },
  { key: 'PLUMBING',     label: 'Plumbing' },
  { key: 'ELECTRICAL',   label: 'Electrical' },
  { key: 'ROOF_EXTERIOR',label: 'Roof & Exterior' },
  { key: 'SAFETY',       label: 'Safety' },
  { key: 'SMART_HOME',   label: 'Smart Home' },
  { key: 'OTHER',        label: 'Other' },
];

// Keys cover both InventoryItemCategory values (primary lookup from inventoryItem.category)
// and GuidanceIssueDomain values (fallback when no item is in scope).
export const FRESHNESS_COPY: Record<string, string> = {
  // Inventory category keys
  HVAC:            'Seasonal pricing — verify before booking.',
  APPLIANCE:       'Pricing is stable for this category.',
  PLUMBING:        'Costs vary by region and urgency.',
  ROOF_EXTERIOR:   'Pricing peaks spring–summer.',
  ELECTRICAL:      'Labour rates shift quarterly.',
  LANDSCAPING:     'Seasonal demand affects rates.',
  PEST_CONTROL:    'Rates are stable year-round.',
  // issueDomain fallbacks
  ASSET_LIFECYCLE: 'Pricing varies by asset age and region — verify before booking.',
  MAINTENANCE:     'Costs vary by region and urgency.',
  WEATHER:         'Emergency rates may apply — verify before committing.',
  INSURANCE:       'Compare rates before purchasing coverage.',
  FINANCIAL:       'Verify pricing before committing to a quote.',
  SAFETY:          'Safety repairs may need urgent scheduling — verify pricing first.',
  ENERGY:          'Seasonal demand affects improvement costs.',
  COMPLIANCE:      'Regulatory work requires licensed contractors — get multiple quotes.',
};
