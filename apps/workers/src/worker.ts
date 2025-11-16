// apps/workers/src/worker.ts
import { PrismaClient, ChecklistItemStatus } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

// A placeholder for a real email service
// In a real app, this would use a service like Postmark, SendGrid, or AWS SES
const emailService = {
  send: async (to: string, subject: string, body: string) => {
    console.log('---------------------------------');
    console.log(`📧 SIMULATING EMAIL SEND 📧`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    // console.log(`   Body: ${body}`); // (Omitted for brevity in logs)
    console.log('---------------------------------');
    // Simulate a network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return { success: true };
  },
};

/**
 * Finds all recurring maintenance tasks that are due within the next 7 days
 * and sends an email reminder to the homeowner.
 */
async function sendMaintenanceReminders() {
  console.log(`[${new Date().toISOString()}] Running daily maintenance reminder job...`);

  // Calculate the date range: from now up to 7 days from now
  const today = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(today.getDate() + 7);

  try {
    const tasksDueSoon = await prisma.checklistItem.findMany({
      where: {
        isRecurring: true,
        status: ChecklistItemStatus.PENDING,
        nextDueDate: {
          gte: today,         // Due between today...
          lte: sevenDaysFromNow, // ...and 7 days from now
        },
      },
      include: {
        checklist: {
          include: {
            homeownerProfile: {
              include: {
                user: {
                  select: {
                    email: true,
                    firstName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (tasksDueSoon.length === 0) {
      console.log('✅ No upcoming maintenance tasks found. Job complete.');
      return;
    }

    console.log(`Found ${tasksDueSoon.length} tasks due soon. Sending notifications...`);

    // Use Promise.all to send emails in parallel
    await Promise.all(
      tasksDueSoon.map(async (task) => {
        const user = task.checklist?.homeownerProfile?.user;
        if (!user || !user.email) {
          console.error(`Skipping task ${task.id}: No user email found.`);
          return;
        }

        const dueDate = new Date(task.nextDueDate!).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        });

        // Email content
        const subject = `Upcoming Maintenance Reminder: ${task.title}`;
        const body = `
          Hi ${user.firstName},

          This is a friendly reminder that your recurring maintenance task "${task.title}" is due soon.
          
          Due Date: ${dueDate}

          Log in to your Contract to Cozy dashboard to manage this task or find a provider.

          Thanks,
          The Contract to Cozy Team
        `;

        try {
          await emailService.send(user.email, subject, body);
          console.log(`   -> Sent reminder for "${task.title}" to ${user.email}`);
        } catch (emailError) {
          console.error(`Failed to send email for task ${task.id}:`, emailError);
        }
      })
    );

    console.log('✅ All maintenance reminders sent. Job complete.');
  } catch (error) {
    console.error('❌ Error running maintenance reminder job:', error);
  }
}

/**
 * Main worker function to start all cron jobs.
 */
function startWorker() {
  console.log('🚀 Worker started. Waiting for jobs...');

  // Schedule sendMaintenanceReminders to run once per day at 9:00 AM
  // (Cron format: minute hour day-of-month month day-of-week)
  cron.schedule('0 9 * * *', sendMaintenanceReminders, {
    timezone: 'America/New_York', // Use a specific timezone
  });

  // --- For demonstration purposes, run it once on startup ---
  console.log('Running maintenance reminder job on startup for demo...');
  sendMaintenanceReminders();
  // --- End demonstration ---
}

// Start the worker
startWorker();