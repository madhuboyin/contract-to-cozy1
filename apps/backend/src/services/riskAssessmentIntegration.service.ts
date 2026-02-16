// apps/backend/src/services/riskAssessmentIntegration.service.ts
/**
 * PHASE 2 INTEGRATION: Risk Assessment → PropertyMaintenanceTask
 * 
 * This service handles creation of maintenance tasks from risk assessment
 * recommendations for EXISTING_OWNER segment.
 * 
 * Integration Points:
 * - Risk assessment generates recommendations
 * - Creates PropertyMaintenanceTask with source=RISK_ASSESSMENT
 * - Skips HOME_BUYER segment (they don't need risk-based maintenance)
 * - Idempotent via actionKey
 */

import { ServiceCategory } from '@prisma/client';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { prisma } from '../lib/prisma';

/**
 * Creates maintenance tasks from risk assessment report.
 * 
 * Call this after generating or updating a RiskAssessmentReport.
 * 
 * @param propertyId - Property ID
 * @param userId - User ID (for ownership verification)
 * @param recommendations - Array of risk-based recommendations
 */
export async function createTasksFromRiskAssessment(
  propertyId: string,
  userId: string,
  recommendations: Array<{
    assetType: string;
    systemType: string;
    category: string;
    title: string;
    description: string;
    priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    riskLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
    estimatedCost: number;
    age?: number;
    expectedLife?: number;
    exposure?: number;
  }>
): Promise<{
  created: number;
  skipped: number;
  tasks: any[];
}> {
  // 1. Get property with homeowner profile to check segment
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      homeownerProfile: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // 2. Skip HOME_BUYER segment (they don't need risk-based maintenance)
  if (property.homeownerProfile.segment === 'HOME_BUYER') {
    console.log(`⏭️  Skipping risk task creation for HOME_BUYER property: ${propertyId}`);
    return {
      created: 0,
      skipped: recommendations.length,
      tasks: [],
    };
  }

  // 3. Create PropertyMaintenanceTask for each recommendation
  const tasks: any[] = [];
  let created = 0;
  let skipped = 0;

  for (const rec of recommendations) {
    try {
      // Calculate nextDueDate based on urgency
      const nextDueDate = calculateDueDateFromPriority(rec.priority);

      // Map service category from assetType
      const serviceCategory = mapAssetTypeToServiceCategory(rec.assetType);

      const result = await PropertyMaintenanceTaskService.createFromActionCenter(
        userId,
        propertyId,
        {
          title: rec.title,
          description: rec.description,
          assetType: rec.assetType,
          priority: rec.priority,
          riskLevel: rec.riskLevel,
          serviceCategory: serviceCategory,
          estimatedCost: rec.estimatedCost,
          nextDueDate: nextDueDate.toISOString(),
        }
      );

      if (!result.deduped) {
        created++;
      } else {
        skipped++;
      }

      tasks.push(result.task);

      console.log(`✅ Created/found risk task: ${rec.title} (deduped: ${result.deduped})`);
    } catch (error) {
      console.error(`❌ Failed to create risk task for ${rec.assetType}:`, error);
      skipped++;
    }
  }

  return {
    created,
    skipped,
    tasks,
  };
}

/**
 * Calculate due date based on priority level.
 */
function calculateDueDateFromPriority(priority: string): Date {
  const now = new Date();
  
  switch (priority) {
    case 'URGENT':
      // 1 week
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'HIGH':
      // 1 month
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'MEDIUM':
      // 3 months
      return new Date(now.setMonth(now.getMonth() + 3));
    case 'LOW':
      // 6 months
      return new Date(now.setMonth(now.getMonth() + 6));
    default:
      // Default to 3 months
      return new Date(now.setMonth(now.getMonth() + 3));
  }
}

/**
 * Map assetType to ServiceCategory for booking integration.
 */
function mapAssetTypeToServiceCategory(assetType: string): ServiceCategory | undefined {
  const mapping: Record<string, ServiceCategory> = {
    'HVAC_FURNACE': ServiceCategory.HVAC,
    'HVAC_HEAT_PUMP': ServiceCategory.HVAC,
    'HVAC_AC': ServiceCategory.HVAC,
    'WATER_HEATER_TANK': ServiceCategory.PLUMBING,
    'WATER_HEATER_TANKLESS': ServiceCategory.PLUMBING,
    'ELECTRICAL_PANEL': ServiceCategory.ELECTRICAL,
    'ROOF_SHINGLE': ServiceCategory.HANDYMAN,
    'ROOF_TILE': ServiceCategory.HANDYMAN,
    'ROOF_METAL': ServiceCategory.HANDYMAN,
    'ROOF_FLAT': ServiceCategory.HANDYMAN,
    'FOUNDATION': ServiceCategory.HANDYMAN,
    'PLUMBING_MAIN': ServiceCategory.PLUMBING,
    'PLUMBING_FIXTURES': ServiceCategory.PLUMBING,
  };

  return mapping[assetType];
}

/**
 * USAGE EXAMPLE - Add this to your RiskAssessmentService
 * 
 * After calculating risk report:
 * 
 * ```typescript
 * // In RiskAssessmentService.calculateRiskScore() or similar
 * 
 * // ... existing risk calculation logic ...
 * 
 * // Generate recommendations
 * const recommendations = details.components
 *   .filter(c => c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL')
 *   .map(c => ({
 *     assetType: c.systemType,
 *     systemType: c.systemType,
 *     category: c.category,
 *     title: `Inspect/Replace ${c.systemType}`,
 *     description: c.recommendedAction || 'Maintenance required',
 *     priority: c.riskLevel === 'CRITICAL' ? 'URGENT' : 'HIGH',
 *     riskLevel: c.riskLevel,
 *     estimatedCost: c.replacementCost,
 *     age: c.age,
 *     expectedLife: c.expectedLife,
 *     exposure: c.financialExposure,
 *   }));
 * 
 * // Create maintenance tasks from recommendations
 * await createTasksFromRiskAssessment(
 *   propertyId,
 *   userId,
 *   recommendations
 * );
 * ```
 */

/**
 * STEP-BY-STEP INTEGRATION GUIDE
 * ==============================
 * 
 * 1. FIND YOUR RISK ASSESSMENT SERVICE
 *    Location: apps/backend/src/services/riskAssessment.service.ts
 *    (or similar name)
 * 
 * 2. IMPORT THIS SERVICE
 *    Add at top of file:
 *    import { createTasksFromRiskAssessment } from './riskAssessmentIntegration.service';
 * 
 * 3. FIND THE FUNCTION THAT GENERATES/UPDATES RISK REPORTS
 *    Likely named something like:
 *    - calculateRiskScore()
 *    - generateRiskReport()
 *    - updateRiskAssessment()
 * 
 * 4. ADD TASK CREATION AFTER RISK CALCULATION
 *    After the risk report is saved to database, add:
 * 
 *    ```typescript
 *    // Extract high-priority recommendations
 *    const recommendations = riskReport.details.components
 *      .filter(c => c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL')
 *      .map(c => ({
 *        assetType: c.systemType,
 *        systemType: c.systemType,
 *        category: c.category,
 *        title: `${c.riskLevel} Risk: ${c.systemType}`,
 *        description: c.recommendedAction || `Maintenance required for ${c.systemType}`,
 *        priority: c.riskLevel === 'CRITICAL' ? 'URGENT' : 'HIGH',
 *        riskLevel: c.riskLevel,
 *        estimatedCost: Number(c.replacementCost),
 *        age: c.age,
 *        expectedLife: c.expectedLife,
 *        exposure: Number(c.financialExposure),
 *      }));
 * 
 *    // Create maintenance tasks (idempotent, won't create duplicates)
 *    const taskResult = await createTasksFromRiskAssessment(
 *      propertyId,
 *      userId,
 *      recommendations
 *    );
 * 
 *    console.log(`✅ Risk assessment tasks: ${taskResult.created} created, ${taskResult.skipped} skipped`);
 *    ```
 * 
 * 5. TEST
 *    - Trigger risk assessment for an EXISTING_OWNER property
 *    - Verify PropertyMaintenanceTask records created in database
 *    - Verify no tasks created for HOME_BUYER properties
 *    - Verify tasks appear in Action Center
 * 
 * 6. VERIFY IDEMPOTENCY
 *    - Run risk assessment twice
 *    - Should see "X created, Y skipped" on second run
 *    - No duplicate tasks should be created
 */