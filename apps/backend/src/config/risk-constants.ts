//apps/backend/src/config/risk-constants.ts

import { RiskCategory } from "@prisma/client";

// The structure mirrors the SystemComponentConfig model, using hardcoded, typical industry values.

export interface SystemRiskConfig {
  systemType: string;         // Unique identifier (e.g., 'HVAC_FURNACE')
  category: RiskCategory;     // STRUCTURAL, SYSTEMS, SAFETY
  expectedLife: number;       // In years
  replacementCost: number;    // Estimated USD replacement cost (major component of impact)
  warningFlags?: { [key: string]: number }; // Optional map for non-age risk factors (probability bump)
}

export const RISK_ASSET_CONFIG: SystemRiskConfig[] = [
  // ============================================================================
  // SYSTEMS CATEGORY
  // ============================================================================
  {
    systemType: "HVAC_FURNACE",
    category: RiskCategory.SYSTEMS,
    expectedLife: 15,
    replacementCost: 8500,
  },
  {
    systemType: "HVAC_HEAT_PUMP",
    category: RiskCategory.SYSTEMS,
    expectedLife: 12,
    replacementCost: 10000,
  },
  {
    systemType: "WATER_HEATER_TANK",
    category: RiskCategory.SYSTEMS,
    expectedLife: 10,
    replacementCost: 1500,
  },
  {
    systemType: "WATER_HEATER_TANKLESS",
    category: RiskCategory.SYSTEMS,
    expectedLife: 20,
    replacementCost: 4000,
  },
  {
    systemType: "ELECTRICAL_PANEL_MODERN",
    category: RiskCategory.SYSTEMS,
    expectedLife: 40,
    replacementCost: 3500,
  },
  {
    systemType: "ELECTRICAL_PANEL_OLD",
    category: RiskCategory.SYSTEMS,
    expectedLife: 30, // Lower expected life/higher baseline risk due to type
    replacementCost: 3000,
    warningFlags: {
        electricalPanelAgeOver40: 0.2, // Safety/fire risk bump
    }
  },

  // ============================================================================
  // STRUCTURE CATEGORY
  // ============================================================================
  {
    systemType: "ROOF_SHINGLE",
    category: RiskCategory.STRUCTURE,
    expectedLife: 20,
    replacementCost: 18000,
    warningFlags: {
        hasDrainageIssues: 0.1, // Minor risk bump on structural integrity
    }
  },
  {
    systemType: "ROOF_TILE_METAL",
    category: RiskCategory.STRUCTURE,
    expectedLife: 50,
    replacementCost: 30000,
  },
  {
    systemType: "FOUNDATION_CONCRETE_SLAB",
    category: RiskCategory.STRUCTURE,
    expectedLife: 100, // Very long life, failure is due to external factors
    replacementCost: 50000,
    warningFlags: {
        hasDrainageIssues: 0.3, // High risk bump for foundation issues
    }
  },

  // ============================================================================
  // SAFETY & APPLIANCES CATEGORY
  // ============================================================================
  {
    systemType: "MAJOR_APPLIANCE_FRIDGE",
    category: RiskCategory.SYSTEMS,
    expectedLife: 12,
    replacementCost: 2000,
  },
  {
    systemType: "MAJOR_APPLIANCE_DISHWASHER",
    category: RiskCategory.SYSTEMS,
    expectedLife: 10,
    replacementCost: 800,
  },
  {
    systemType: "SAFETY_SMOKE_CO_DETECTORS",
    category: RiskCategory.SAFETY,
    expectedLife: 10,
    replacementCost: 300, // Low cost, high importance, often tied to a "safety score"
    warningFlags: {
        isDetectorExpired: 0.8, // If expired, massive probability of regulatory/failure risk
    }
  }
];