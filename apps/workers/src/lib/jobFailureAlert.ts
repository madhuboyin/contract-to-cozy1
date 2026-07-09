// apps/workers/src/lib/jobFailureAlert.ts
//
// Job failures previously only reached a structured log line — nothing paged
// or emailed an admin, so a broken cron job (e.g. recall ingest) could run
// failing for days before anyone noticed via the worker-jobs dashboard.
// This sends an email (reusing the existing SMTP transport) to every ADMIN
// user once a job has exhausted its retries.

import type { Job } from 'bullmq';
import { UserRole } from '@prisma/client';
import { prisma } from './prisma';
import { sendEmail } from '../email/email.service';
import { logger } from './logger';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // avoid re-alerting on every recurring run of a persistently-broken job
const lastAlertSentAt = new Map<string, number>();

export async function alertOnJobFailure(
  queueName: string,
  job: Job | undefined,
  err: unknown,
): Promise<void> {
  const attemptsMade = job?.attemptsMade ?? 1;
  const maxAttempts = job?.opts?.attempts ?? 1;

  // Only alert once the job has genuinely given up — not on every retry attempt.
  if (attemptsMade < maxAttempts) return;

  const jobLabel = job?.name ?? 'unknown';
  const cooldownKey = `${queueName}:${jobLabel}`;
  const now = Date.now();
  const lastSent = lastAlertSentAt.get(cooldownKey) ?? 0;
  if (now - lastSent < ALERT_COOLDOWN_MS) return;
  lastAlertSentAt.set(cooldownKey, now);

  try {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { email: true },
    });
    if (!admins.length) return;

    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const subject = `[Worker Alert] ${jobLabel} failed after ${attemptsMade}/${maxAttempts} attempt(s)`;
    const html = `
      <p>Queue: <b>${queueName}</b></p>
      <p>Job: <b>${jobLabel}</b>${job?.id ? ` (id ${job.id})` : ''}</p>
      <p>Attempts: ${attemptsMade}/${maxAttempts}</p>
      <pre>${message.slice(0, 2000)}</pre>
    `;

    await Promise.all(admins.map((admin) => sendEmail(admin.email, subject, html)));
  } catch (alertErr) {
    logger.error({ alertErr }, '[JOB-FAILURE-ALERT] Failed to send failure alert email');
  }
}
