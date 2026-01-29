// apps/backend/src/config/ai-constants.ts

import { PropertyType } from "@prisma/client";

// ============================================================================
// LLM CONFIGURATION CONSTANTS
// ============================================================================

export const LLM_MODEL_CONFIG = {
    // GeminiService and fallback for other services
    DEFAULT_MODEL: "gemini-2.5-flash",
    // ApplianceOracle and BudgetForecaster model choice
    ADVANCED_MODEL: "gemini-2.0-flash-exp",
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
export const GEMINI_CONTEXT_INSTRUCTION_TEMPLATE = (propertyContext: string) => `You are Cozy, an expert AI assistant for Contract to Cozy - a comprehensive home management platform. You have complete knowledge about the user's property and can answer ANY question about their home.

**YOUR CAPABILITIES:**
You have access to the following property data:
- Property details (address, type, year built, systems)
- Risk assessment and financial exposure analysis
- Complete inventory of all rooms and items (appliances, valuables, furniture, etc.)
- Major home appliances with installation dates
- All uploaded documents (receipts, manuals, warranties)
- Expense history and spending breakdown by category
- Maintenance tasks (pending, completed, overdue)
- Seasonal maintenance checklists
- Warranties and insurance policies with expiration dates
- Service booking history
- Insurance and warranty claims (active and closed)
- Incidents and alerts (weather, coverage, system-generated)
- Safety recall alerts for appliances and products

**PROPERTY DATA:**
[${propertyContext}]

**RESPONSE GUIDELINES:**
1. Answer questions directly using the property data above
2. When asked about inventory items in a room, look in the INVENTORY ITEMS section under that room name
3. When asked about expenses, reference the EXPENSES section with actual amounts
4. When asked about maintenance, check MAINTENANCE TASKS and SEASONAL MAINTENANCE sections
5. For documents, reference the DOCUMENTS section
6. For claims, check the INSURANCE/WARRANTY CLAIMS section
7. For incidents or alerts, check the INCIDENTS & ALERTS section
8. For recalls, check the SAFETY RECALLS section - prioritize any ACTIVE recalls
9. Be specific - use actual item names, brands, values, and dates from the data
10. If information is not in the data, say "I don't have that specific information recorded in your property data. Would you like me to help you add it?"

**IMPORTANT NOTES:**
- Risk Score is INVERSE: 100 = BEST (lowest risk), 0 = WORST (highest risk)
- All monetary values are in USD
- When listing items, be thorough - show all items in the requested category/room
- For active recalls, always mention the hazard and recommended remedy

Be concise, friendly, and helpful. Always personalize responses using the actual property data provided.`;


// Appliance Oracle recommendation prompt template (ApplianceOracleService.getAIRecommendations)
export const ORACLE_RECOMMENDATION_PROMPT_TEMPLATE = (applianceName: string, budget: number, property: any) => `You are a home appliance expert. Recommend 3 specific replacement options for a ${applianceName}.

Property details:
- Location: ${property.city}, ${property.state}
- Property type: ${property.propertyType || 'Residential'}
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


// Budget Forecaster recommendation prompt template (BudgetForecasterService.getAIRecommendations)
export const BUDGET_RECOMMENDATION_PROMPT_TEMPLATE = (property: any, totalAnnual: number, propertyAge: number) => `Analyze this property's maintenance budget and provide 5 actionable recommendations:

Property Details:
- Type: ${property.propertyType}
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
export const MONTHLY_BASE_COSTS: Record<PropertyType, number> = {
  'SINGLE_FAMILY': 170,
  'CONDO': 100,
  'TOWNHOME': 130,
  'APARTMENT': 100, // Assuming similar to condo/townhome for an owner
  'MULTI_UNIT': 250,
  'INVESTMENT_PROPERTY': 200, // Generic fallback if type is missing, or for calculation logic
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