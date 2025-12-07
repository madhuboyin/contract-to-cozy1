// apps/backend/src/utils/propertyScore.util.ts
import { Property, PropertyType, HeatingType, CoolingType, WaterHeaterType, RoofType, HomeAsset, Warranty, Booking } from '@prisma/client';

export interface HealthScoreResult {
  totalScore: number;
  baseScore: number;
  maxPotentialScore: number;
  unlockedScore: number;
  maxBaseScore: number;
  maxExtraScore: number;
  insights: { factor: string; status: string; score: number }[];
  ctaNeeded: boolean;
}

const MAX_SCORE = 100;
const MAX_BASE_SCORE = 55;
const MAX_EXTRA_SCORE = 45;

const BASE_WEIGHTS = {
  AGE: 15,
  STRUCTURE: 10,
  SYSTEMS: 15,
  USAGE_WEAR: 10,
  SIZE: 5,
};

const EXTRA_WEIGHTS = {
  HVAC_AGE: 10,
  WATER_HEATER_AGE: 5,
  ROOF_AGE: 10,
  SAFETY: 5,
  EXTERIOR: 5,
  DOCUMENTS: 5,
  APPLIANCES: 5,
};

// Interface extension reflecting how property.service.ts sends the data
interface PropertyWithAssetsForScore extends Property {
    homeAssets: HomeAsset[];
    warranties: Warranty[];
}

/**
 * Helper: Check if a specific insight is being addressed by an active booking
 * UPDATED: Now uses insightFactor field for precise matching
 */
function isInsightBeingAddressed(insightName: string, activeBookings: Booking[]): boolean {
  return activeBookings.some(
    booking => booking.insightFactor === insightName
  );
}

/**
 * Calculates the Property Health Score based on property attributes and related data.
 * UPDATED: Now accepts full Booking objects to check insightFactor for precise suppression
 * 
 * @param property The full Property object from Prisma.
 * @param documentCount The number of documents linked to the property.
 * @param activeBookings Array of active bookings (PENDING, CONFIRMED, IN_PROGRESS) with insightFactor field
 */
export function calculateHealthScore(
  property: Property, 
  documentCount: number,
  activeBookings: Booking[] = [] // CHANGED: Now accepts full Booking objects instead of category strings
): HealthScoreResult {
  const currentYear = new Date().getFullYear();
  let baseScore = 0;
  let extraScore = 0;
  let maxUnlockableScore = 0;
  const insights: { factor: string; status: string; score: number }[] = [];
  
  // Cast the property to access the homeAssets and warranties relation
  const propertyWithAssets = property as PropertyWithAssetsForScore;

  // --- BASE SCORE CALCULATION (MANDATORY FIELDS: MAX 55) ---

  // 1. Age Factor (Max 15)
  if (property.yearBuilt) {
    const age = currentYear - property.yearBuilt;
    const ageScore = Math.max(0, BASE_WEIGHTS.AGE * (1 - age / 60));
    baseScore += ageScore;
    
    let status = 'Good';
    if (age < 15) {
        status = 'Excellent';
    } else if (age < 30) {
        status = 'Good';
    } else {
        // Age >= 30, triggers 'Needs Review'
        // UPDATED: Check insightFactor instead of category
        if (isInsightBeingAddressed('Age Factor', activeBookings)) {
            status = 'Action Pending'; 
        } else {
            status = 'Needs Review';
        }
    }

    insights.push({ factor: 'Age Factor', status, score: ageScore });
  } else {
    insights.push({ factor: 'Age Factor', status: 'Missing Data', score: 0 });
    maxUnlockableScore += BASE_WEIGHTS.AGE; 
  }

  // 2. Structure Factor (Max 10)
  if (property.propertyType && property.roofType) {
    let structureScore = 0;
    // Property Type (5 pts max)
    if (property.propertyType === PropertyType.SINGLE_FAMILY) structureScore += 5;
    else if (property.propertyType === PropertyType.TOWNHOME || property.propertyType === PropertyType.CONDO) structureScore += 3;

    // Roof Type (5 pts max)
    if (property.roofType === RoofType.SHINGLE || property.roofType === RoofType.METAL) structureScore += 5;
    else if (property.roofType === RoofType.TILE) structureScore += 2;

    baseScore += structureScore;
    insights.push({ factor: 'Structure Factor', status: structureScore > 7 ? 'Good' : 'Average', score: structureScore });
  } else {
    insights.push({ factor: 'Structure Factor', status: 'Missing Data', score: 0 });
    maxUnlockableScore += BASE_WEIGHTS.STRUCTURE;
  }

  // 3. Systems Factor (Max 15)
  if (property.heatingType && property.coolingType && property.waterHeaterType) {
    let systemsScore = 0;

    // Heating (5 pts)
    if (property.heatingType === HeatingType.HEAT_PUMP || property.heatingType === HeatingType.HVAC) systemsScore += 5;
    else if (property.heatingType === HeatingType.FURNACE) systemsScore += 3;

    // Cooling (5 pts)
    if (property.coolingType === CoolingType.CENTRAL_AC) systemsScore += 5;
    else if (property.coolingType === CoolingType.WINDOW_AC) systemsScore += 2;

    // Water Heater (5 pts)
    if (property.waterHeaterType === WaterHeaterType.TANKLESS || property.waterHeaterType === WaterHeaterType.HEAT_PUMP) systemsScore += 5;
    else if (property.waterHeaterType === WaterHeaterType.TANK) systemsScore += 3;

    baseScore += systemsScore;
    insights.push({ factor: 'Systems Factor', status: systemsScore > 10 ? 'Modern' : 'Standard', score: systemsScore });
  } else {
    insights.push({ factor: 'Systems Factor', status: 'Missing Data', score: 0 });
    maxUnlockableScore += BASE_WEIGHTS.SYSTEMS;
  }

  // 4. Usage/Wear Factor (Max 10) 
  if (property.occupantsCount && property.propertySize) {
    let usageScore = BASE_WEIGHTS.USAGE_WEAR; // Start high
    // Deduct 2 points per occupant over 2.
    if (property.occupantsCount > 2) {
        usageScore = Math.max(0, usageScore - (property.occupantsCount - 2) * 2);
    }
    baseScore += usageScore;
    insights.push({ factor: 'Usage/Wear Factor', status: usageScore > 8 ? 'Low Density' : 'High Density', score: usageScore });
  } else {
    insights.push({ factor: 'Usage/Wear Factor', status: 'Missing Data', score: 0 });
    maxUnlockableScore += BASE_WEIGHTS.USAGE_WEAR;
  }
  
  // 5. Size Factor (Max 5)
  if (property.propertySize) {
    let sizeScore = 0;
    if (property.propertySize >= 1000 && property.propertySize <= 3500) sizeScore = 5;
    else if (property.propertySize > 3500 && property.propertySize < 5000 || property.propertySize < 1000) sizeScore = 3;
    
    baseScore += sizeScore;
    insights.push({ factor: 'Size Factor', status: sizeScore === 5 ? 'Optimal' : 'Standard', score: sizeScore });
  } else {
    insights.push({ factor: 'Size Factor', status: 'Missing Data', score: 0 });
    maxUnlockableScore += BASE_WEIGHTS.SIZE;
  }

  // Cap baseScore at MAX_BASE_SCORE
  baseScore = Math.min(baseScore, MAX_BASE_SCORE);

  // --- EXTRA SCORE CALCULATION (OPTIONAL FIELDS: MAX 45) ---

  // 1. HVAC Age (Max 10)
  if (property.hvacInstallYear) {
    const age = currentYear - property.hvacInstallYear;
    const hvacScore = Math.max(0, EXTRA_WEIGHTS.HVAC_AGE * (1 - age / 20));
    extraScore += hvacScore;
    
    let status = age < 8 ? 'Good' : 'Aging';
    if (age >= 15) {
        // UPDATED: Check insightFactor instead of category
        if (isInsightBeingAddressed('HVAC Age', activeBookings)) {
            status = 'Action Pending';
        } else {
            status = 'Needs Inspection';
        }
    }
    insights.push({ factor: 'HVAC Age', status, score: hvacScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.HVAC_AGE;
  }

  // 2. Water Heater Age (Max 5)
  if (property.waterHeaterInstallYear) {
    const age = currentYear - property.waterHeaterInstallYear;
    const whScore = Math.max(0, EXTRA_WEIGHTS.WATER_HEATER_AGE * (1 - age / 12));
    extraScore += whScore;
    
    let status = age < 5 ? 'Good' : 'Aging';
    if (age >= 10) {
        // UPDATED: Check insightFactor instead of category
        if (isInsightBeingAddressed('Water Heater Age', activeBookings)) {
            status = 'Action Pending';
        } else {
            status = 'Needs Review';
        }
    }
    insights.push({ factor: 'Water Heater Age', status, score: whScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.WATER_HEATER_AGE;
  }
  
  // 3. Roof Age (Max 10)
  if (property.roofReplacementYear) {
    const age = currentYear - property.roofReplacementYear;
    const roofScore = Math.max(0, EXTRA_WEIGHTS.ROOF_AGE * (1 - age / 25));
    extraScore += roofScore;
    
    let status = age < 15 ? 'Good' : 'Aging';
    if (age >= 20) {
        // UPDATED: Check insightFactor instead of category
        if (isInsightBeingAddressed('Roof Age', activeBookings)) {
            status = 'Action Pending';
        } else {
            status = 'Needs Inspection';
        }
    }
    insights.push({ factor: 'Roof Age', status, score: roofScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.ROOF_AGE;
  }

  // 4. Safety Equipment (Max 5)
  const safetyChecks: (keyof Property)[] = ['hasSmokeDetectors', 'hasCoDetectors', 'hasSecuritySystem', 'hasFireExtinguisher'];
  let safetyScore = 0;
  let safetyCompleted = 0;
  safetyChecks.forEach(key => {
      if (property[key] === true) {
          safetyScore += (EXTRA_WEIGHTS.SAFETY / 4);
          safetyCompleted++;
      } else if (property[key] !== null) {
          safetyCompleted++;
      }
  });
  if (safetyCompleted > 0) {
    extraScore += safetyScore;
    insights.push({ factor: 'Safety', status: safetyScore === 5 ? 'Complete' : 'Incomplete', score: safetyScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.SAFETY;
  }

  // 5. Exterior/Drainage (Max 5)
  if (property.hasDrainageIssues !== null || property.hasIrrigation !== null) {
      let extScore = 5;
      if (property.hasDrainageIssues === true) extScore -= 2.5; // Penalty
      if (property.hasIrrigation === true) extScore += 2.5; // Bonus/Feature
      extraScore += Math.min(5, extScore);
      
      let status = 'Good';
      if (property.hasDrainageIssues === true) {
          // UPDATED: Check insightFactor instead of category
          // This prevents cross-talk - only bookings specifically for Exterior will suppress it
          if (isInsightBeingAddressed('Exterior', activeBookings)) {
              status = 'Action Pending';
          } else {
              status = 'Needs Attention';
          }
      }
      insights.push({ factor: 'Exterior', status, score: extScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.EXTERIOR;
  }

  // 6. Document Uploads (Max 5)
  if (documentCount > 0) {
    const docScore = documentCount >= 3 ? EXTRA_WEIGHTS.DOCUMENTS : documentCount * (EXTRA_WEIGHTS.DOCUMENTS / 3);
    extraScore += docScore;
    insights.push({ factor: 'Documents', status: documentCount >= 3 ? 'Complete' : 'Partial', score: docScore });
  } else {
    maxUnlockableScore += EXTRA_WEIGHTS.DOCUMENTS;
  }
  
  // 7. Appliance Ages (Max 5) - FINAL IMPLEMENTATION
  const assetCount = propertyWithAssets.homeAssets?.length || 0;
  const maxAssetsForScore = 3; // Define completeness threshold
  
  // Check for active home warranty coverage for any appliance
  const currentYearCheck = new Date().getFullYear();
  const hasActiveHomeWarranty = propertyWithAssets.warranties.some(w => 
      // Assuming any standard warranty covers appliances and is active (expiry date in current year or later)
      w.expiryDate && new Date(w.expiryDate).getFullYear() >= currentYearCheck
  );

  if (assetCount > 0) {
    const maxScore = EXTRA_WEIGHTS.APPLIANCES;
    // Score based on completion ratio (capped at maxScore)
    let appScore = Math.min(maxScore, assetCount * (maxScore / maxAssetsForScore)); 
    
     // Determine Age Risk: Flag if any primary asset is over 15 years old.
     const criticallyAging = propertyWithAssets.homeAssets.some(
         (a: HomeAsset) => a.installationYear !== null && currentYear - a.installationYear > 15 
     );
    
    extraScore += appScore;
    
    // Determine Status:
    let status = 'Complete';
    if (criticallyAging) {
        if (hasActiveHomeWarranty) {
            // If old BUT covered, suppress the alert by marking as Complete.
            status = 'Complete'; 
        } else {
            // If old AND NOT covered, raise specific financial alert.
            status = 'Needs Warranty'; 
        }
    } else if (assetCount < maxAssetsForScore) {
        // If not critically aging, but data is incomplete.
        status = 'Partial';
    } else {
        // Data complete and not critically aging.
        status = 'Complete';
    }

    insights.push({ factor: 'Appliances', status: status, score: appScore });
  } else {
    // Missing data scenario
    insights.push({ factor: 'Appliances', status: 'Missing Data', score: 0 });
    maxUnlockableScore += EXTRA_WEIGHTS.APPLIANCES;
  }
  // END FINAL IMPLEMENTATION


  // --- FINAL RESULT ---

  const totalScore = Math.round(baseScore + extraScore);
  const maxPotentialScore = Math.round(totalScore + maxUnlockableScore);
  
  return {
    totalScore: Math.min(totalScore, MAX_SCORE),
    baseScore: Math.round(baseScore),
    unlockedScore: Math.round(extraScore),
    maxPotentialScore: Math.min(maxPotentialScore, MAX_SCORE),
    maxBaseScore: MAX_BASE_SCORE,
    maxExtraScore: MAX_EXTRA_SCORE,
    // Filter out items that are perfect (unless you want to show "Action Pending" even if score is okay, which might be nice)
    insights: insights.filter(i => 
        i.score > 0 || 
        i.status === 'Missing Data' || 
        i.status === 'Needs Review' || 
        i.status === 'Needs Inspection' ||
        i.status === 'Needs Attention' ||
        i.status === 'Needs Warranty' ||
        i.status === 'Action Pending' 
    ),
    ctaNeeded: maxUnlockableScore > 0,
  };
}