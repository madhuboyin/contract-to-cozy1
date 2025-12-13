// apps/backend/src/config/ai-constants.ts

// NOTE: Assuming the existence of a PropertyType definition for MONTHLY_BASE_COSTS
// import { PropertyType } from "../types/property.types"; 

// ============================================================================
// LLM CONFIGURATION CONSTANTS
// ============================================================================

export const LLM_MODEL_CONFIG = {
  // Model used by generic chat service (gemini.service.ts)
  DEFAULT_MODEL: "gemini-2.5-flash", 
  // Model used by advanced services (Oracle, Forecaster)
  ADVANCED_MODEL: "gemini-2.0-flash-exp", 
  // Standard temperature setting for recommendations
  RECOMMENDATION_TEMPERATURE: 0.7,
  // Max token limits for specific use cases
  ORACLE_MAX_TOKENS: 1000,
  BUDGET_MAX_TOKENS: 500,
} as const;

// ============================================================================
// LLM PROMPT TEMPLATES
// ============================================================================

// Oracle recommendation prompt template (ApplianceOracleService.getAIRecommendations)
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
// BUDGET FORECASTER CONSTANTS (Business/Domain Logic)
// ============================================================================

/**
* Base estimated monthly maintenance cost by property type ($USD). (Previously hardcoded in budgetForecaster.service.ts)
*/
export const MONTHLY_BASE_COSTS: Record<string, number> = {
'SINGLE_FAMILY': 170,
'CONDO': 100,
'TOWNHOUSE': 130, // Assuming TOWNHOUSE is a valid type in the backend
'MULTI_FAMILY': 250,
// Added common fallbacks/extensions to ensure the map is robust
'APARTMENT': 100, 
'INVESTMENT_PROPERTY': 200, 
};

/**
* Standard annual maintenance tasks mapped to the month they typically occur. (Previously hardcoded in budgetForecaster.service.ts)
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
* Default percentage breakdown of annual maintenance costs by category. (Previously implicitly used in budgetForecaster.service.ts)
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