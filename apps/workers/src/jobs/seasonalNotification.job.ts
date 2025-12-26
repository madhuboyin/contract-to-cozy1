// apps/workers/src/jobs/seasonalNotification.job.ts
import { prisma } from '../lib/prisma';
import { sendEmail } from '../email/email.service';

// Type for checklist item with relations
type ChecklistItemWithTemplate = {
  priority: string;
  title: string;
  description: string | null;
  seasonalTaskTemplate: {
    whyItMatters: string | null;
  };
};

/**
 * Background job to send seasonal checklist email notifications
 * Runs daily at 8am
 * 
 * Logic:
 * - Find all checklists that haven't been notified yet
 * - Send email with task breakdown (Critical/Recommended/Optional)
 * - Mark as notified
 */
export async function sendSeasonalNotifications() {
  console.log('[SEASONAL] Starting notification job...');

  try {
    // Find checklists that need notifications
    // @ts-ignore - Model exists in schema but may not be in generated client
    const checklists = await (prisma as any).seasonalChecklist.findMany({
      where: {
        status: 'PENDING',
        notificationSentAt: null,
        property: {
          homeownerProfile: {
            segment: 'EXISTING_OWNER', // Only existing owners
          },
          climateSetting: {
            notificationEnabled: true, // Only if notifications enabled
          },
        },
      },
      include: {
        property: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            seasonalTaskTemplate: true,
          },
        },
      },
    });

    console.log(`[SEASONAL] Found ${checklists.length} checklists to notify`);

    let sent = 0;
    let errors = 0;

    for (const checklist of checklists) {
      try {
        // Skip if no user email
        if (!checklist.property.user?.email) {
          console.log(
            `[SEASONAL] Skipping checklist ${checklist.id} - no user email`
          );
          continue;
        }

        // Calculate days until season starts
        const daysUntil = Math.floor(
          (new Date(checklist.seasonStartDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24)
        );

        // Group tasks by priority
        const criticalTasks = checklist.items.filter(
          (item: ChecklistItemWithTemplate) => item.priority === 'CRITICAL'
        );
        const recommendedTasks = checklist.items.filter(
          (item: ChecklistItemWithTemplate) => item.priority === 'RECOMMENDED'
        );
        const optionalTasks = checklist.items.filter(
          (item: ChecklistItemWithTemplate) => item.priority === 'OPTIONAL'
        );

        // Build email HTML
        const emailHtml = buildSeasonalNotificationEmail({
          firstName: checklist.property.user.firstName || 'Homeowner',
          season: checklist.season,
          year: checklist.year,
          daysUntil,
          climateRegion: checklist.climateRegion,
          totalTasks: checklist.totalTasks,
          criticalTasks: criticalTasks.map((item: ChecklistItemWithTemplate) => ({
            title: item.title,
            description: item.description,
            whyItMatters: item.seasonalTaskTemplate.whyItMatters,
          })),
          recommendedTasks: recommendedTasks.map((item: ChecklistItemWithTemplate) => ({
            title: item.title,
            description: item.description,
          })),
          optionalTasks: optionalTasks.map((item: ChecklistItemWithTemplate) => ({
            title: item.title,
          })),
          checklistUrl: `${process.env.FRONTEND_URL}/dashboard/seasonal`,
          settingsUrl: `${process.env.FRONTEND_URL}/dashboard/seasonal/settings`,
        });

        // Send email
        await sendEmail(
          checklist.property.user.email,
          `${getSeasonName(checklist.season)} is approaching - ${checklist.totalTasks} tasks to prepare your home`,
          emailHtml
        );

        // Mark as notified
        // @ts-ignore - Model exists in schema but may not be in generated client
        await (prisma as any).seasonalChecklist.update({
          where: { id: checklist.id },
          data: {
            notificationSentAt: new Date(),
          },
        });

        console.log(
          `[SEASONAL] Sent notification for ${checklist.season} ${checklist.year} ` +
            `to ${checklist.property.user.email}`
        );

        sent++;
      } catch (emailError) {
        console.error(
          `[SEASONAL] Error sending notification for checklist ${checklist.id}:`,
          emailError
        );
        errors++;
      }
    }

    console.log(
      `[SEASONAL] Notification job complete. Sent: ${sent}, Errors: ${errors}`
    );
  } catch (error) {
    console.error('[SEASONAL] Fatal error in notification job:', error);
    throw error;
  }
}

/**
 * Build HTML email for seasonal notification
 */
function buildSeasonalNotificationEmail(data: {
  firstName: string;
  season: string;
  year: number;
  daysUntil: number;
  climateRegion: string;
  totalTasks: number;
  criticalTasks: Array<{ title: string; description?: string | null; whyItMatters?: string | null }>;
  recommendedTasks: Array<{ title: string; description?: string | null }>;
  optionalTasks: Array<{ title: string }>;
  checklistUrl: string;
  settingsUrl: string;
}): string {
  const seasonName = getSeasonName(data.season);
  const seasonEmoji = getSeasonEmoji(data.season);
  const climateName = getClimateRegionName(data.climateRegion);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seasonName} Maintenance Checklist</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">${seasonEmoji}</div>
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                ${seasonName} is Approaching!
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">
                ${data.daysUntil} days until ${seasonName} ${data.year}
              </p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 24px; margin: 0 0 20px;">
                Hi ${data.firstName},
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 24px; margin: 0 0 20px;">
                We've prepared a customized maintenance checklist for your ${climateName} climate zone with <strong>${data.totalTasks} tasks</strong> to get your home ready for ${seasonName}.
              </p>
            </td>
          </tr>

          <!-- Critical Tasks -->
          ${data.criticalTasks.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 20px;">
              <div style="background-color: #fee; border-left: 4px solid #dc2626; padding: 20px; border-radius: 4px;">
                <h2 style="color: #dc2626; margin: 0 0 15px; font-size: 18px; font-weight: 600;">
                  🔴 Critical Tasks (${data.criticalTasks.length})
                </h2>
                <p style="color: #991b1b; margin: 0 0 15px; font-size: 14px;">
                  These tasks help prevent expensive damage and safety issues.
                </p>
                <ul style="margin: 0; padding-left: 20px;">
                  ${data.criticalTasks.map(task => `
                    <li style="color: #333; margin-bottom: 10px; line-height: 20px;">
                      <strong>${task.title}</strong>
                      ${task.whyItMatters ? `<br><span style="color: #666; font-size: 13px;">${task.whyItMatters}</span>` : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Recommended Tasks -->
          ${data.recommendedTasks.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 20px;">
              <h2 style="color: #d97706; margin: 0 0 15px; font-size: 18px; font-weight: 600;">
                🟡 Recommended Tasks (${data.recommendedTasks.length})
              </h2>
              <ul style="margin: 0; padding-left: 20px;">
                ${data.recommendedTasks.slice(0, 5).map(task => `
                  <li style="color: #333; margin-bottom: 8px;">
                    ${task.title}
                    ${task.description ? `<br><span style="color: #666; font-size: 13px;">${task.description}</span>` : ''}
                  </li>
                `).join('')}
                ${data.recommendedTasks.length > 5 ? `
                  <li style="color: #666; font-style: italic;">
                    ...and ${data.recommendedTasks.length - 5} more
                  </li>
                ` : ''}
              </ul>
            </td>
          </tr>
          ` : ''}

          <!-- Optional Tasks -->
          ${data.optionalTasks.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 20px;">
              <h2 style="color: #059669; margin: 0 0 15px; font-size: 18px; font-weight: 600;">
                🟢 Optional Tasks (${data.optionalTasks.length})
              </h2>
              <p style="color: #666; font-size: 14px; margin: 0;">
                Nice-to-have improvements when you have time
              </p>
            </td>
          </tr>
          ` : ''}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 30px; text-align: center;">
              <a href="${data.checklistUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                View Full Checklist & Add Tasks
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px; text-align: center;">
                Climate Zone: ${climateName} | ${seasonName} starts ${new Date(data.year, getSeasonStartMonth(data.season), getSeasonStartDay(data.season)).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                <a href="${data.settingsUrl}" style="color: #6b7280; text-decoration: underline;">Customize your settings</a> | 
                <a href="${data.settingsUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Helper functions
 */
function getSeasonName(season: string): string {
  const names: Record<string, string> = {
    SPRING: 'Spring',
    SUMMER: 'Summer',
    FALL: 'Fall',
    WINTER: 'Winter',
  };
  return names[season] || season;
}

function getSeasonEmoji(season: string): string {
  const emojis: Record<string, string> = {
    SPRING: '🌸',
    SUMMER: '☀️',
    FALL: '🍂',
    WINTER: '❄️',
  };
  return emojis[season] || '📅';
}

function getClimateRegionName(region: string): string {
  const names: Record<string, string> = {
    VERY_COLD: 'Very Cold',
    COLD: 'Cold',
    MODERATE: 'Moderate',
    WARM: 'Warm',
    TROPICAL: 'Tropical',
  };
  return names[region] || region;
}

function getSeasonStartMonth(season: string): number {
  const months: Record<string, number> = {
    SPRING: 2, // March (0-indexed)
    SUMMER: 5, // June
    FALL: 8, // September
    WINTER: 11, // December
  };
  return months[season] || 2;
}

function getSeasonStartDay(season: string): number {
  const days: Record<string, number> = {
    SPRING: 20,
    SUMMER: 21,
    FALL: 23,
    WINTER: 21,
  };
  return days[season] || 20;
}