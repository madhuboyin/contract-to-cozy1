// apps/workers/src/jobs/seasonalChecklistExpiration.job.ts
import { prisma } from '../lib/prisma';

/**
 * Background job to mark seasonal checklists as complete/expired
 * Runs daily at 3am
 * 
 * Logic:
 * - Find all checklists where season has ended (past seasonEndDate)
 * - Update status based on completion:
 *   - 100% complete → COMPLETED
 *   - <100% complete → IN_PROGRESS (season ended, not fully complete)
 * - Log completion rates for analytics
 */
export async function expireSeasonalChecklists() {
  console.log('[SEASONAL] Starting checklist expiration job...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of day

    // Find checklists where season has ended and status is still PENDING or IN_PROGRESS
    // @ts-ignore - Model exists in schema but may not be in generated client
    const expiredChecklists = await (prisma as any).seasonalChecklist.findMany({
      where: {
        seasonEndDate: {
          lt: today, // Season end date is in the past
        },
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
      },
      include: {
        property: {
          include: {
            homeownerProfile: true,
          },
        },
      },
    });

    console.log(`[SEASONAL] Found ${expiredChecklists.length} expired checklists`);

    let completed = 0;
    let incomplete = 0;
    let errors = 0;

    for (const checklist of expiredChecklists) {
      try {
        // Calculate completion percentage
        const completionPercentage =
          checklist.totalTasks > 0
            ? Math.round((checklist.tasksCompleted / checklist.totalTasks) * 100)
            : 0;

        // Determine final status
        const finalStatus = completionPercentage === 100 ? 'COMPLETED' : 'IN_PROGRESS';

        // Update checklist status
        // @ts-ignore - Model exists in schema but may not be in generated client
        await (prisma as any).seasonalChecklist.update({
          where: { id: checklist.id },
          data: {
            status: finalStatus,
          },
        });

        // Log completion stats
        console.log(
          `[SEASONAL] Expired ${checklist.season} ${checklist.year} for property ` +
            `${checklist.propertyId.substring(0, 8)}: ${completionPercentage}% complete ` +
            `(${checklist.tasksCompleted}/${checklist.totalTasks}) → ${finalStatus}`
        );

        if (finalStatus === 'COMPLETED') {
          completed++;
        } else {
          incomplete++;
        }

        // Optional: Create analytics event for tracking
        await logSeasonalCompletionAnalytics(checklist, completionPercentage);
      } catch (checklistError) {
        console.error(
          `[SEASONAL] Error expiring checklist ${checklist.id}:`,
          checklistError
        );
        errors++;
      }
    }

    console.log(
      `[SEASONAL] Expiration job complete. ` +
        `Completed: ${completed}, Incomplete: ${incomplete}, Errors: ${errors}`
    );

    // Calculate and log aggregate stats
    if (expiredChecklists.length > 0) {
      const totalTasks = expiredChecklists.reduce(
        (sum: number, c: any) => sum + c.totalTasks,
        0
      );
      const totalCompleted = expiredChecklists.reduce(
        (sum: number, c: any) => sum + c.tasksCompleted,
        0
      );
      const averageCompletion =
        totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

      console.log(
        `[SEASONAL] Aggregate stats: ${averageCompletion}% average completion ` +
          `(${totalCompleted}/${totalTasks} tasks)`
      );
    }
  } catch (error) {
    console.error('[SEASONAL] Fatal error in expiration job:', error);
    throw error;
  }
}

/**
 * Log seasonal completion analytics
 * Optional: Integrate with your analytics service (Mixpanel, Segment, etc.)
 */
async function logSeasonalCompletionAnalytics(
  checklist: any,
  completionPercentage: number
) {
  try {
    // Example: Log to console (replace with your analytics service)
    const analyticsEvent = {
      event: 'seasonal_checklist_completed',
      properties: {
        season: checklist.season,
        year: checklist.year,
        climateRegion: checklist.climateRegion,
        totalTasks: checklist.totalTasks,
        tasksCompleted: checklist.tasksCompleted,
        tasksAdded: checklist.tasksAdded,
        completionPercentage,
        status: checklist.status,
        propertyId: checklist.propertyId,
        homeownerSegment: checklist.property?.homeownerProfile?.segment,
        daysActive: Math.floor(
          (new Date().getTime() - new Date(checklist.generatedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      },
      timestamp: new Date().toISOString(),
    };

    console.log('[SEASONAL ANALYTICS]', JSON.stringify(analyticsEvent));

    // TODO: Send to analytics service
    // await analyticsService.track(analyticsEvent);

    // Optional: Store in database for historical tracking
    // await prisma.seasonalAnalytics.create({ data: analyticsEvent });
  } catch (error) {
    console.error('[SEASONAL] Error logging analytics:', error);
    // Don't throw - analytics errors shouldn't break the job
  }
}

/**
 * Optional: Clean up old checklists
 * Run this monthly to remove very old completed checklists
 */
export async function cleanupOldSeasonalChecklists() {
  console.log('[SEASONAL] Starting cleanup job for old checklists...');

  try {
    // Delete checklists older than 2 years that are completed or dismissed
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // @ts-ignore - Model exists in schema but may not be in generated client
    const result = await (prisma as any).seasonalChecklist.deleteMany({
      where: {
        seasonEndDate: {
          lt: twoYearsAgo,
        },
        status: {
          in: ['COMPLETED', 'DISMISSED'],
        },
      },
    });

    console.log(`[SEASONAL] Cleaned up ${result.count} old checklists`);
  } catch (error) {
    console.error('[SEASONAL] Error in cleanup job:', error);
    throw error;
  }
}