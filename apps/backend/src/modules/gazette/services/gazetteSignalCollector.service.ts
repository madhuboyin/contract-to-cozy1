// apps/backend/src/modules/gazette/services/gazetteSignalCollector.service.ts
// Queries upstream Prisma tables to collect weekly signals for a property.
// Each source is wrapped in try/catch — partial failure returns fewer signals.

import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { SourceSignal, GazetteWeekWindow } from '../types/gazette.types';

export class GazetteSignalCollectorService {
  /**
   * Collect all source signals for a property within a week window.
   * Uses Promise.allSettled for parallel queries; partial failures are logged and skipped.
   */
  static async collectSignals(
    propertyId: string,
    weekWindow: GazetteWeekWindow,
  ): Promise<SourceSignal[]> {
    // Look up homeownerProfileId from property
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, homeownerProfileId: true },
    });

    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    const homeownerProfileId = property.homeownerProfileId;
    const { weekStart, weekEnd } = weekWindow;

    // Extend window for maintenance (7 extra days)
    const maintenanceDeadline = new Date(weekEnd);
    maintenanceDeadline.setDate(maintenanceDeadline.getDate() + 7);

    // Extend backward for neighborhood (14 days before week start)
    const neighborhoodLookback = new Date(weekStart);
    neighborhoodLookback.setDate(neighborhoodLookback.getDate() - 14);

    // Warranty: expiry within 90 days from now
    const warrantyWindow = new Date();
    warrantyWindow.setDate(warrantyWindow.getDate() + 90);

    // Insurance: expiry within 60 days from now
    const insuranceWindow = new Date();
    insuranceWindow.setDate(insuranceWindow.getDate() + 60);

    const now = new Date();

    const results = await Promise.allSettled([
      // 1. MAINTENANCE
      GazetteSignalCollectorService._collectMaintenance(
        propertyId,
        maintenanceDeadline,
        now,
      ),
      // 2. INCIDENT
      GazetteSignalCollectorService._collectIncidents(propertyId),
      // 3. CLAIMS
      GazetteSignalCollectorService._collectClaims(propertyId),
      // 4. WARRANTY
      GazetteSignalCollectorService._collectWarranties(
        homeownerProfileId,
        propertyId,
        warrantyWindow,
        now,
      ),
      // 5. INSURANCE
      GazetteSignalCollectorService._collectInsurance(
        homeownerProfileId,
        propertyId,
        insuranceWindow,
        now,
      ),
      // 6. SCORE
      GazetteSignalCollectorService._collectScore(propertyId),
      // 7. REFINANCE
      GazetteSignalCollectorService._collectRefinance(propertyId),
      // 8. NEIGHBORHOOD
      GazetteSignalCollectorService._collectNeighborhood(
        propertyId,
        neighborhoodLookback,
      ),
    ]);

    const signals: SourceSignal[] = [];
    const sourceNames = [
      'MAINTENANCE',
      'INCIDENT',
      'CLAIMS',
      'WARRANTY',
      'INSURANCE',
      'SCORE',
      'REFINANCE',
      'NEIGHBORHOOD',
    ];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      } else {
        console.error(
          `[GazetteSignalCollector] Failed to collect ${sourceNames[i]} signals for property ${propertyId}:`,
          result.reason,
        );
      }
    }

    return signals;
  }

  // ---------------------------------------------------------------------------
  // Private source collectors
  // ---------------------------------------------------------------------------

  private static async _collectMaintenance(
    propertyId: string,
    deadline: Date,
    now: Date,
  ): Promise<SourceSignal[]> {
    const tasks = await prisma.propertyMaintenanceTask.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'IN_PROGRESS'] as any[] },
        OR: [
          { nextDueDate: { lte: deadline } },
          { nextDueDate: { lt: now } }, // overdue
        ],
      },
      orderBy: { nextDueDate: 'asc' },
      take: 5,
    });

    return tasks.map((task) => {
      const isHighPriority =
        task.priority === 'HIGH' || task.priority === 'URGENT';
      return {
        sourceFeature: 'MAINTENANCE',
        sourceEventId: task.id,
        storyCategory: 'MAINTENANCE',
        storyTag: (task as any).taskType ?? undefined,
        entityType: 'PropertyMaintenanceTask',
        entityId: task.id,
        headlineHint: `Maintenance task: ${task.title}`,
        supportingFacts: {
          title: task.title,
          status: task.status,
          priority: task.priority,
          nextDueDate: task.nextDueDate?.toISOString() ?? null,
          description: (task as any).description ?? null,
        },
        urgency: isHighPriority ? 0.8 : 0.5,
        financialImpact: isHighPriority ? 0.5 : 0.3,
        confidence: 0.85,
        engagement: 0.6,
        primaryDeepLink: `/dashboard/properties/${propertyId}/tools/maintenance`,
        shareSafe: true,
      } satisfies SourceSignal;
    });
  }

  private static async _collectIncidents(
    propertyId: string,
  ): Promise<SourceSignal[]> {
    const incidents = await prisma.incident.findMany({
      where: {
        propertyId,
        status: { notIn: ['RESOLVED', 'EXPIRED'] as any[] },
        isSuppressed: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return incidents.map((incident) => {
      const severity: string = (incident as any).severity ?? 'INFO';
      let urgency = 0.5;
      if (severity === 'CRITICAL') urgency = 0.9;
      else if (severity === 'WARNING') urgency = 0.7;

      return {
        sourceFeature: 'INCIDENT',
        sourceEventId: incident.id,
        storyCategory: 'INCIDENT',
        storyTag: (incident as any).incidentType ?? undefined,
        entityType: 'Incident',
        entityId: incident.id,
        headlineHint: (incident as any).title ?? 'Active incident at your property',
        supportingFacts: {
          title: (incident as any).title ?? null,
          description: (incident as any).description ?? null,
          severity,
          status: incident.status,
          incidentType: (incident as any).incidentType ?? null,
          reportedAt: incident.createdAt?.toISOString() ?? null,
        },
        urgency,
        financialImpact: severity === 'CRITICAL' ? 0.8 : 0.4,
        confidence: 0.9,
        engagement: 0.7,
        primaryDeepLink: `/dashboard/properties/${propertyId}/incidents/${incident.id}`,
        shareSafe: false, // incidents are not share-safe by default
      } satisfies SourceSignal;
    });
  }

  private static async _collectClaims(
    propertyId: string,
  ): Promise<SourceSignal[]> {
    const claims = await prisma.claim.findMany({
      where: {
        propertyId,
        status: { notIn: ['CLOSED', 'DENIED'] as any[] },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return claims.map((claim) => ({
      sourceFeature: 'CLAIMS',
      sourceEventId: claim.id,
      storyCategory: 'CLAIMS',
      storyTag: (claim as any).claimType ?? undefined,
      entityType: 'Claim',
      entityId: claim.id,
      headlineHint: `Insurance claim: ${(claim as any).claimType ?? 'pending'}`,
      supportingFacts: {
        claimType: (claim as any).claimType ?? null,
        status: claim.status,
        amount: (claim as any).amount ?? null,
        filedAt: (claim as any).filedAt ?? claim.createdAt?.toISOString() ?? null,
      },
      urgency: 0.7,
      financialImpact: 0.6,
      confidence: 0.9,
      engagement: 0.6,
      primaryDeepLink: `/dashboard/properties/${propertyId}/claims/${claim.id}`,
      shareSafe: false,
    })) satisfies SourceSignal[];
  }

  private static async _collectWarranties(
    homeownerProfileId: string | null,
    propertyId: string,
    warrantyWindow: Date,
    now: Date,
  ): Promise<SourceSignal[]> {
    if (!homeownerProfileId) return [];

    const warranties = await prisma.warranty.findMany({
      where: {
        homeownerProfileId,
        propertyId,
        expiryDate: {
          gte: now,
          lte: warrantyWindow,
        },
      },
      orderBy: { expiryDate: 'asc' },
      take: 3,
    });

    return warranties.map((warranty) => {
      const expiryDate = new Date((warranty as any).expiryDate);
      const daysUntilExpiry = Math.max(
        0,
        Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const isNearExpiry = daysUntilExpiry < 30;

      return {
        sourceFeature: 'WARRANTY',
        sourceEventId: warranty.id,
        storyCategory: 'WARRANTY',
        storyTag: (warranty as any).warrantyType ?? undefined,
        entityType: 'Warranty',
        entityId: warranty.id,
        headlineHint: `Warranty expiring: ${(warranty as any).itemName ?? 'appliance'}`,
        supportingFacts: {
          itemName: (warranty as any).itemName ?? null,
          warrantyType: (warranty as any).warrantyType ?? null,
          expiryDate: expiryDate.toISOString(),
          daysUntilExpiry,
          provider: (warranty as any).provider ?? null,
        },
        urgency: isNearExpiry ? 0.8 : 0.5,
        financialImpact: 0.4,
        confidence: 0.95,
        engagement: 0.5,
        primaryDeepLink: `/dashboard/properties/${propertyId}/insurance`,
        shareSafe: true,
      } satisfies SourceSignal;
    });
  }

  private static async _collectInsurance(
    homeownerProfileId: string | null,
    propertyId: string,
    insuranceWindow: Date,
    now: Date,
  ): Promise<SourceSignal[]> {
    if (!homeownerProfileId) return [];

    const policies = await prisma.insurancePolicy.findMany({
      where: {
        homeownerProfileId,
        expiryDate: {
          gte: now,
          lte: insuranceWindow,
        },
      },
      orderBy: { expiryDate: 'asc' },
      take: 3,
    });

    return policies.map((policy) => {
      const expiryDate = new Date((policy as any).expiryDate);
      const daysUntilExpiry = Math.max(
        0,
        Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const isNearExpiry = daysUntilExpiry < 30;

      return {
        sourceFeature: 'INSURANCE',
        sourceEventId: policy.id,
        storyCategory: 'INSURANCE',
        storyTag: (policy as any).policyType ?? undefined,
        entityType: 'InsurancePolicy',
        entityId: policy.id,
        headlineHint: `Insurance policy expiring: ${(policy as any).policyType ?? 'homeowner'}`,
        supportingFacts: {
          policyType: (policy as any).policyType ?? null,
          policyNumber: (policy as any).policyNumber ?? null,
          provider: (policy as any).provider ?? null,
          expiryDate: expiryDate.toISOString(),
          daysUntilExpiry,
          premiumAmount: (policy as any).premiumAmount ?? null,
        },
        urgency: isNearExpiry ? 0.85 : 0.6,
        financialImpact: 0.7,
        confidence: 0.95,
        engagement: 0.55,
        primaryDeepLink: `/dashboard/properties/${propertyId}/insurance`,
        shareSafe: true,
      } satisfies SourceSignal;
    });
  }

  private static async _collectScore(
    propertyId: string,
  ): Promise<SourceSignal[]> {
    const snapshot = await prisma.propertyScoreSnapshot.findFirst({
      where: { propertyId },
      orderBy: { weekStart: 'desc' },
    });

    if (!snapshot) return [];

    const score = (snapshot as any).overallScore ?? (snapshot as any).score ?? 0;

    return [
      {
        sourceFeature: 'SCORE',
        sourceEventId: snapshot.id,
        storyCategory: 'SCORE',
        entityType: 'PropertyScoreSnapshot',
        entityId: snapshot.id,
        headlineHint: `Home Score: ${score}`,
        supportingFacts: {
          score,
          weekStart: (snapshot as any).weekStart?.toISOString() ?? null,
          previousScore: (snapshot as any).previousScore ?? null,
          scoreBreakdown: (snapshot as any).scoreBreakdown ?? null,
        },
        urgency: score < 50 ? 0.7 : 0.3,
        financialImpact: score < 50 ? 0.5 : 0.2,
        confidence: 1.0,
        engagement: 0.7,
        primaryDeepLink: `/dashboard/properties/${propertyId}/home-score`,
        shareSafe: true,
      } satisfies SourceSignal,
    ];
  }

  private static async _collectRefinance(
    propertyId: string,
  ): Promise<SourceSignal[]> {
    const opportunity = await prisma.refinanceOpportunity.findFirst({
      where: {
        propertyId,
        radarState: 'OPEN' as any,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!opportunity) return [];

    const monthlySavings = (opportunity as any).monthlySavings ?? 0;
    const normalizedFinancialImpact = Math.min(1.0, monthlySavings / 500);

    return [
      {
        sourceFeature: 'REFINANCE_RADAR',
        sourceEventId: opportunity.id,
        storyCategory: 'REFINANCE',
        entityType: 'RefinanceOpportunity',
        entityId: opportunity.id,
        headlineHint: `Refinance opportunity: save $${Math.round(monthlySavings)}/month`,
        supportingFacts: {
          monthlySavings,
          currentRate: (opportunity as any).currentRatePct ?? null,
          newRate: (opportunity as any).newRatePct ?? null,
          breakEvenMonths: (opportunity as any).breakEvenMonths ?? null,
          estimatedSavings: (opportunity as any).totalSavingsEstimate ?? null,
        },
        urgency: 0.7,
        financialImpact: normalizedFinancialImpact,
        confidence: 0.8,
        engagement: 0.75,
        primaryDeepLink: `/dashboard/properties/${propertyId}/tools/refinance-radar`,
        shareSafe: true,
      } satisfies SourceSignal,
    ];
  }

  private static async _collectNeighborhood(
    propertyId: string,
    lookbackStart: Date,
  ): Promise<SourceSignal[]> {
    const events = await prisma.propertyNeighborhoodEvent.findMany({
      where: {
        propertyId,
        createdAt: { gte: lookbackStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return events.map((event) => ({
      sourceFeature: 'NEIGHBORHOOD',
      sourceEventId: event.id,
      storyCategory: 'NEIGHBORHOOD',
      storyTag: (event as any).eventType ?? undefined,
      entityType: 'PropertyNeighborhoodEvent',
      entityId: event.id,
      headlineHint: (event as any).title ?? 'Neighborhood activity near your property',
      supportingFacts: {
        title: (event as any).title ?? null,
        eventType: (event as any).eventType ?? null,
        description: (event as any).description ?? null,
        eventDate: (event as any).eventDate?.toISOString() ?? event.createdAt?.toISOString() ?? null,
        distance: (event as any).distanceMiles ?? null,
      },
      urgency: 0.4,
      financialImpact: 0.2,
      confidence: 0.7,
      engagement: 0.6,
      primaryDeepLink: `/dashboard/properties/${propertyId}/neighborhood`,
      shareSafe: true,
    })) satisfies SourceSignal[];
  }
}
