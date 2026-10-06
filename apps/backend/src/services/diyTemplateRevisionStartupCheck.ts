// apps/backend/src/services/diyTemplateRevisionStartupCheck.ts
//
// Boot-time warning for the DIY template revision rollout (docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md). Homeowners see a template's published
// head revision, so a template that is ACTIVE with no head is invisible and cannot start a project: that is exactly the state before the one-time
// backfill (prisma/diy-template-revisions-backfill.pgadmin.sql) has been run. This only WARNS and never blocks the server or throws: a failed check is
// logged and the app starts as normal. It writes nothing.
import { prisma as defaultPrisma } from '../lib/prisma';
import { logger as defaultLogger } from '../lib/logger';

type Counts = { liveWithoutHead: number; reviewWithoutCandidate: number };

export async function warnAboutDiyTemplateRevisionState(
  db: Pick<typeof defaultPrisma, 'diyProjectTemplate'> = defaultPrisma,
  log: Pick<typeof defaultLogger, 'warn'> = defaultLogger,
): Promise<Counts | null> {
  try {
    const liveWithoutHead = await db.diyProjectTemplate.count({ where: { status: 'ACTIVE', publishedRevisionId: null } });
    // Sent for review before revisions existed: no open candidate, so approve and publish are refused until an admin returns them to draft.
    const reviewWithoutCandidate = await db.diyProjectTemplate.count({
      where: { status: { in: ['REVIEW', 'APPROVED'] }, revisions: { none: { returnedAt: null, publishedAt: null, retiredAt: null } } },
    });
    if (liveWithoutHead > 0) {
      log.warn(
        { liveWithoutHead },
        '[DIY] templates are ACTIVE with no published revision: homeowners cannot see them or start projects from them. Run prisma/diy-template-revisions-backfill.pgadmin.sql (docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md).',
      );
    }
    if (reviewWithoutCandidate > 0) {
      log.warn(
        { reviewWithoutCandidate },
        '[DIY] templates in REVIEW or APPROVED predate revisions: an admin must return them to draft and submit them again before they can be approved or published.',
      );
    }
    return { liveWithoutHead, reviewWithoutCandidate };
  } catch (error) {
    log.warn({ err: error }, '[DIY] could not check the DIY template revision state at startup (the server is unaffected)');
    return null;
  }
}
