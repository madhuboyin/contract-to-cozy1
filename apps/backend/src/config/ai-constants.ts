// apps/backend/src/config/ai-constants.ts

import { DwellingType } from "@prisma/client";

// ============================================================================
// LLM CONFIGURATION CONSTANTS
// ============================================================================

export const LLM_MODEL_CONFIG = {
    // GeminiService and fallback for other services
    DEFAULT_MODEL: "gemini-2.5-flash",
    // ApplianceOracle and BudgetForecaster model choice
    ADVANCED_MODEL: "gemini-2.0-flash",
    // Standard parameters for generation
    RECOMMENDATION_TEMPERATURE: 0.7,
    ORACLE_MAX_TOKENS: 1000,
    BUDGET_MAX_TOKENS: 500,
} as const;

// ============================================================================
// LLM PROMPT TEMPLATES
// ============================================================================

// Base instruction for the generic chat bot (GeminiService.getOrCreateChat)
export const GEMINI_BASE_INSTRUCTION = "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional. **IMPORTANT: The Risk Score in this system is INVERSE: 100 means BEST (minimum risk), and 0 means WORST (maximum risk).**";

// Contextual instruction template for chat with property info (GeminiService.getOrCreateChat)
export const GEMINI_CONTEXT_INSTRUCTION_TEMPLATE = (propertyContext: string) => `You are Cozy, an expert AI assistant for Contract to Cozy. You have a bounded, authorized snapshot of selected property facts.

**YOUR CAPABILITIES:**
Use only facts present in the snapshot. Never assume access to inventory,
documents, finances, household-profile answers, or other omitted domains.

**PROPERTY DATA:**
[${propertyContext}]

**RESPONSE GUIDELINES:**
1. Answer questions directly using only the property data above
2. When asked about inventory items in a room, look in the INVENTORY ITEMS section under that room name
3. When asked about expenses, reference the EXPENSES section with actual amounts
4. When asked about maintenance, check MAINTENANCE TASKS and SEASONAL MAINTENANCE sections
5. For documents, reference the DOCUMENTS section
6. For claims, check the INSURANCE/WARRANTY CLAIMS section
7. For incidents or alerts, check the INCIDENTS & ALERTS section
8. For recalls, check the SAFETY RECALLS section - prioritize any ACTIVE recalls
9. Be specific only when a supporting fact is present
10. If information is not in the data, say "I don't have that specific information recorded in your property data. Would you like me to help you add it?"
11. Cite every property-specific factual statement with [fact:FACT_KEY], using the exact key from usedFacts. Never invent a citation key.

**RENOVATION PLANNING:**
When the user asks about a renovation, remodel, addition, or home improvement project:
- Remind them to check permit requirements for their city/county before starting work
- Mention that contractor licensing rules vary by state and project type
- Note that permitted improvements can trigger property tax reassessment
- Suggest using the **Renovation Risk Advisor** tool (available in Home Tools) for a detailed permit, tax impact, and licensing check specific to their project and jurisdiction
- Do not fabricate specific permit fees, timelines, or licensing rules — direct them to the tool for data-backed guidance

**IMPORTANT NOTES:**
- Risk Score is INVERSE: 100 = BEST (lowest risk), 0 = WORST (highest risk)
- All monetary values are in USD
- Never imply that the bounded snapshot is a complete property record
- For active recalls, always mention the hazard and recommended remedy

Be concise, friendly, and helpful. Always personalize responses using the actual property data provided.`;


// Appliance Oracle recommendation prompt template (ApplianceOracleService.getAIRecommendations)
export const ORACLE_RECOMMENDATION_PROMPT_TEMPLATE = (applianceName: string, budget: number, property: any) => `You are a home appliance expert. Recommend 3 specific replacement options for a ${applianceName}.

Property details:
- Location: ${property.city}, ${property.state}
- Dwelling type: ${property.dwellingType || 'Residential'}
- Budget range: $${Math.round(budget * 0.8)} - $${Math.round(budget * 1.2)}

Provide recommendations in this EXACT JSON format (no markdown, no code blocks):
[
  {
    "brand": "Brand Name",
    "model": "Specific Model Number",
    "features": ["Feature 1", "Feature 2", "Feature 3"],
    "estimatedCost": 0000,
    "energyRating": "Energy Star rating or efficiency",
    "warranty": "X year warranty",
    "reasoning": "Why this is recommended (1 sentence)"
  }
]

Focus on reliable brands, energy efficiency, and value. Include budget, mid-range, and premium options.`;


// Model shortlist prompt template (ModelShortlistAdvisorService.generateShortlist)
function getModelSpecInstructions(assetCategory: string): string {
  const instructions: Record<string, string> = {
    dishwasher: `For keySpecs include exactly these 5 keys: "Noise Level" (e.g. "44 dBA"), "Energy Use" (e.g. "270 kWh/yr"), "Capacity" (e.g. "16 place settings"), "Wash Programs" (e.g. "8 cycles"), "Dry Technology" (e.g. "CrystalDry" or "Heated dry").`,
    refrigerator: `For keySpecs include exactly these 5 keys: "Total Capacity" (e.g. "26.8 cu ft"), "Annual Energy" (e.g. "640 kWh/yr"), "Noise Level" (e.g. "38 dB"), "Compressor" (e.g. "Linear Inverter"), "Ice & Water" (e.g. "In-door ice maker").`,
    washer: `For keySpecs include exactly these 5 keys: "Drum Capacity" (e.g. "4.5 cu ft"), "Energy Use" (e.g. "0.19 kWh/cycle"), "Water Use" (e.g. "14 gal/cycle"), "Max Spin Speed" (e.g. "1,400 RPM"), "Noise" (e.g. "47 dB").`,
    dryer: `For keySpecs include exactly these 5 keys: "Drum Capacity" (e.g. "7.4 cu ft"), "Energy Use" (e.g. "4.3 kWh/cycle"), "Sensor Dry" (e.g. "Moisture sensor"), "Programs" (e.g. "12 drying programs"), "Noise" (e.g. "50 dB").`,
    water_heater: `For keySpecs include exactly these 5 keys: "First Hour Rating" (e.g. "67 gal"), "UEF Rating" (e.g. "0.93"), "Recovery Rate" (e.g. "38 gal/hr"), "Type" (e.g. "50-gal tank" or "Tankless"), "Warranty" (e.g. "6-yr tank, 1-yr parts").`,
    hvac: `For keySpecs include exactly these 5 keys: "SEER2 Rating" (e.g. "18 SEER2"), "BTU Capacity" (e.g. "36,000 BTU / 3 ton"), "Stages" (e.g. "Two-stage"), "Noise" (e.g. "72 dB outdoor"), "Annual kWh" (e.g. "~2,100 kWh/yr").`,
    furnace: `For keySpecs include exactly these 5 keys: "AFUE Rating" (e.g. "96% AFUE"), "BTU Output" (e.g. "80,000 BTU"), "Stages" (e.g. "Two-stage modulating"), "Noise" (e.g. "55 dB"), "Warranty" (e.g. "20-yr heat exchanger").`,
    ac: `For keySpecs include exactly these 5 keys: "SEER2 Rating" (e.g. "16 SEER2"), "BTU Capacity" (e.g. "24,000 BTU / 2 ton"), "Stages" (e.g. "Single-stage"), "Noise" (e.g. "74 dB outdoor"), "Annual kWh" (e.g. "~1,400 kWh/yr").`,
  };
  return instructions[assetCategory] ?? `For keySpecs include exactly these 5 keys relevant to this appliance: "Energy Rating", "Noise Level", "Primary Feature", "Warranty", "Capacity or Output".`;
}

const PRIORITY_INSTRUCTIONS: Record<string, string> = {
  lowest_cost: 'The user\'s top priority is LOWEST UPFRONT COST. The budget tier should be the strongest recommendation. Keep all three options lean on price.',
  energy_savings: 'The user\'s top priority is LOWEST ENERGY BILLS. Lead with Energy Star certified models and include estimated annual kWh savings vs. a baseline model in the "whyThisForYou" reasoning.',
  quiet_operation: 'The user\'s top priority is QUIET OPERATION. Lead with the noise level (dBA) spec for every recommendation. The budget tier should still be reasonably quiet; the premium tier should be the quietest available.',
  long_term_reliability: 'The user\'s top priority is LONG-TERM RELIABILITY. Favor brands with strong reliability records and longer warranties. Call out the reliability reputation in the "whyThisForYou" field.',
  fast_availability: 'The user\'s top priority is FAST AVAILABILITY. Favor models commonly stocked at major US retailers (Home Depot, Lowe\'s, Best Buy, Costco). Note typical stock status in the "whyThisForYou" field.',
};

const TENURE_INSTRUCTIONS: Record<string, string> = {
  under_3: 'IMPORTANT: The homeowner plans to stay LESS THAN 3 YEARS. Do not recommend premium models unless the payback period is under 2 years. Prioritize lower upfront cost and avoid over-investing in energy efficiency.',
  '3_to_7': 'The homeowner plans to stay 3–7 YEARS. Balance upfront cost with moderate efficiency and reliability gains. Mid-range is likely the sweet spot.',
  '7_plus': 'The homeowner plans to stay 7+ YEARS. Efficiency premiums are fully justified. Prioritize long-term reliability, Energy Star ratings, and strong warranties. Mention approximate payback periods where relevant.',
};

export const MODEL_SHORTLIST_PROMPT_TEMPLATE = (params: {
  assetName: string;
  assetCategory: string;
  budgetMin: number;
  budgetMax: number;
  rebateAmount: number;
  city: string;
  state: string;
  primaryPriority?: string;
  homeOwnershipYears?: string;
  mustHaves?: string[];
  journeyContext?: string;
}): string => {
  const { assetName, assetCategory, budgetMin, budgetMax, rebateAmount, city, state, primaryPriority, homeOwnershipYears, mustHaves, journeyContext } = params;

  const lines: string[] = [];
  lines.push(`You are a home appliance expert helping a homeowner in ${city}${state ? `, ${state}` : ''} choose a replacement ${assetName}.`);
  lines.push('');
  lines.push(`Budget: $${budgetMin.toLocaleString()} – $${budgetMax.toLocaleString()}`);
  if (rebateAmount > 0) lines.push(`A $${rebateAmount} rebate or incentive may apply — factor this into value reasoning.`);
  if (primaryPriority && PRIORITY_INSTRUCTIONS[primaryPriority]) lines.push(`\n${PRIORITY_INSTRUCTIONS[primaryPriority]}`);
  if (homeOwnershipYears && TENURE_INSTRUCTIONS[homeOwnershipYears]) lines.push(`\n${TENURE_INSTRUCTIONS[homeOwnershipYears]}`);
  if (mustHaves && mustHaves.includes('energy_star')) lines.push('\nREQUIREMENT: ALL recommendations MUST be Energy Star certified. Do not suggest any model that lacks Energy Star certification.');
  if (mustHaves && mustHaves.includes('smart_home')) lines.push('\nREQUIREMENT: ALL recommendations should support WiFi or smart home integration.');
  if (journeyContext) lines.push(`\nAdditional context: ${journeyContext}`);
  lines.push('');
  lines.push('Recommend exactly 3 real models from brands available in the US market:');
  lines.push('- tier "budget": lowest upfront cost, reliable, within the lower budget range');
  lines.push('- tier "mid": best balance of price, efficiency, and features');
  lines.push('- tier "premium": best long-term specs, energy savings, and longevity');
  lines.push('');
  lines.push(getModelSpecInstructions(assetCategory));
  lines.push('');
  lines.push('Return ONLY a valid JSON array — no markdown, no code blocks:');
  lines.push('[');
  lines.push('  {');
  lines.push('    "brand": "Exact Brand Name",');
  lines.push('    "modelNumber": "Exact Model Number",');
  lines.push('    "displayName": "Brand Series Name (e.g. Bosch 300 Series Dishwasher)",');
  lines.push('    "tier": "budget",');
  lines.push('    "estimatedPrice": 799,');
  lines.push('    "keySpecs": { "Spec Name": "Spec Value" },');
  lines.push('    "whyThisForYou": "One sentence specific to their priorities, tenure, and budget",');
  lines.push('    "energyStarCertified": true,');
  lines.push('    "warrantyYears": 1,');
  lines.push('    "specConfidence": "estimated"');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('Rules: tier must be exactly "budget", "mid", or "premium". estimatedPrice must be a number within budget range. keySpecs must have exactly 5 entries. warrantyYears must be a number. specConfidence must always be "estimated". Use different brands across the 3 tiers when possible.');
  return lines.join('\n');
};


// Vendor suggestions prompt template (VendorSuggestionsAdvisorService.generateSuggestions)
export const VENDOR_SUGGESTIONS_PROMPT_TEMPLATE = (params: {
  assetName: string;
  modelName: string;
  city: string;
  state: string;
  budgetMax?: number;
}): string => {
  const { assetName, modelName, city, state, budgetMax } = params;
  const lines: string[] = [];
  lines.push(`You are a home appliance purchasing expert helping a homeowner in ${city}${state ? `, ${state}` : ''} buy a replacement ${assetName}.`);
  lines.push(`They selected this model: ${modelName}`);
  if (budgetMax) lines.push(`Total budget (unit + install): under $${budgetMax.toLocaleString()}`);
  lines.push('');
  lines.push('Recommend exactly 3 purchase channels. Include one from each category:');
  lines.push('1. A major big-box retailer (Home Depot, Lowe\'s, Best Buy, or Costco)');
  lines.push('2. An online appliance specialist (AJ Madison, Appliances Connection, Amazon, or similar)');
  lines.push('3. A local dealer or manufacturer-direct option appropriate for this region');
  lines.push('');
  lines.push('Return ONLY a valid JSON array — no markdown, no code blocks, no extra text:');
  lines.push('[');
  lines.push('  {');
  lines.push('    "vendorName": "Home Depot",');
  lines.push('    "vendorType": "big_box",');
  lines.push('    "unitPrice": 1299,');
  lines.push('    "deliveryCost": 0,');
  lines.push('    "installationAvailable": true,');
  lines.push('    "installationCost": 159,');
  lines.push('    "returnWindowDays": 30,');
  lines.push('    "whyBuyHere": "One sentence on the key advantage of buying here",');
  lines.push('    "badges": ["Price match guarantee", "Free delivery"]');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('Rules:');
  lines.push('- vendorType: exactly one of "big_box", "online", "local_dealer", "manufacturer", "wholesale"');
  lines.push('- unitPrice: realistic US retail price for this specific model (number in USD, not string)');
  lines.push('- deliveryCost: 0 if free delivery, otherwise estimated USD amount');
  lines.push('- installationCost: USD number if offered, null if not available');
  lines.push('- installationAvailable: true or false');
  lines.push('- returnWindowDays: typical return window in days (number, usually 15–90)');
  lines.push('- badges: array of up to 3 short strings from: "Best price", "Price match", "Free delivery", "Fastest delivery", "Installation included", "Haul away included", "Best return policy", "Local support", "Manufacturer warranty"');
  lines.push('- Vary the 3 vendors — do not pick the same channel twice');
  lines.push('- Use the exact model name to estimate realistic current market prices');
  return lines.join('\n');
};


// Budget Forecaster recommendation prompt template (BudgetForecasterService.getAIRecommendations)
export const BUDGET_RECOMMENDATION_PROMPT_TEMPLATE = (property: any, totalAnnual: number, propertyAge: number) => `Analyze this property's maintenance budget and provide 5 actionable recommendations:

Property Details:
- Dwelling type: ${property.dwellingType}
- Age: ${propertyAge} years
- Location: ${property.city}, ${property.state}
- Annual Budget: $${totalAnnual}

Provide recommendations in this EXACT format (no markdown, no code blocks):
["Recommendation 1", "Recommendation 2", "Recommendation 3", "Recommendation 4", "Recommendation 5"]

Focus on:
1. Budget optimization tips
2. Preventive maintenance priorities
3. Seasonal preparation advice
4. Cost-saving strategies
5. Long-term planning`;


// ============================================================================
// BUDGET FORECASTER CONSTANTS
// (These represent business domain logic/assumptions)
// ============================================================================

/**
 * Base estimated monthly maintenance cost by property type ($USD).
 */
export const MONTHLY_BASE_COSTS: Record<DwellingType, number> = {
  DETACHED_SINGLE_FAMILY: 170,
  ATTACHED_SINGLE_FAMILY: 140,
  TOWNHOUSE: 130,
  CONDO_UNIT: 100,
  APARTMENT_UNIT: 100,
  DUPLEX: 200,
  MULTI_FAMILY: 250,
  MANUFACTURED_HOME: 140,
  OTHER: 150,
  UNKNOWN: 150,
};

/**
 * Standard annual maintenance tasks mapped to the month they typically occur.
 */
export const SEASONAL_TASKS: Record<string, string[]> = {
  'January': ['HVAC filter', 'Check heating system', 'Inspect insulation'],
  'February': ['Water heater maintenance', 'Check pipes for freezing'],
  'March': ['Gutter cleaning', 'Roof inspection', 'AC prep'],
  'April': ['Lawn care starts', 'Exterior paint check', 'Window cleaning'],
  'May': ['AC servicing', 'Sprinkler system check'],
  'June': ['Deck/patio maintenance', 'Tree trimming'],
  'July': ['Pool maintenance', 'Pest control'],
  'August': ['Gutter cleaning', 'Exterior cleaning'],
  'September': ['HVAC maintenance', 'Heating system prep'],
  'October': ['Chimney cleaning', 'Winterization'],
  'November': ['Furnace servicing', 'Weather stripping'],
  'December': ['Holiday prep', 'Emergency fund check'],
};

/**
 * Default percentage breakdown of annual maintenance costs by category.
 */
export const MAINTENANCE_CATEGORY_BREAKDOWN: Array<{
  category: string;
  percentage: number;
  items: string[];
}> = [
  { 
    category: 'HVAC', 
    percentage: 25, 
    items: ['Seasonal maintenance', 'Filter replacements', 'System checks']
  },
  { 
    category: 'Plumbing', 
    percentage: 15, 
    items: ['Drain cleaning', 'Leak repairs', 'Water heater maintenance']
  },
  { 
    category: 'Electrical', 
    percentage: 10, 
    items: ['Outlet repairs', 'Safety inspections', 'Lighting']
  },
  { 
    category: 'Exterior', 
    percentage: 20, 
    items: ['Gutter cleaning', 'Power washing', 'Paint touch-ups']
  },
  { 
    category: 'Lawn & Garden', 
    percentage: 15, 
    items: ['Mowing', 'Trimming', 'Seasonal plantings']
  },
  { 
    category: 'Appliances', 
    percentage: 10, 
    items: ['Repairs', 'Servicing', 'Replacements']
  },
  { 
    category: 'Emergency Fund', 
    percentage: 5, 
    items: ['Unexpected repairs', 'Emergency calls']
  },
];
