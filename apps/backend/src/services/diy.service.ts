// apps/backend/src/services/diy.service.ts
import { Prisma, DiyProjectStatus, DiyProjectCategory, DiyTemplateStatus, DiySkillLevel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { DomainEventsService } from './domainEvents/domainEvents.service';
import { hasPropertyRoleWithin } from './propertyAccess.service';
import { DIY_COMPLETION_EVENT_KEY } from './diy/diyCompletionEffects';
import { describeCompletionEffects } from './diy/completionEffectsStatus';
import { describeTaskLink, occurrenceIdOf } from './diy/taskLinkStatus';
import { DIY_TASK_RECONCILE_EVENT_KEY } from './diy/diyTaskReconciliationRequest';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateDiyApplicability } from './diy/applicabilityPolicy';
import { evaluateDiyEligibility } from './diy/eligibilityPolicy';
import { evaluateTemplateStart } from './diy/templateStartPolicy';
import { logger } from '../lib/logger';
import { evaluateStepTransition, openStepsForCompletion, type DiyStepStatusValue } from './diy/stepTransitions';
import { evaluateAskProjectPolicy, evaluateAskStepPolicy, type AskStepPolicyName } from './diy/askStepPolicy';
import { buildRevisionContent, checkRevisionIntegrity, computeContentHash, shareLockGovernanceRows } from './diyTemplateRevision.service';
import {
  PUBLISHED_REVISION_INCLUDE, eligibilityInputFromRevision, publishedTemplateDetail, publishedTemplateSummary, revisionContent, stepSnapshotId,
} from './diyPublishedTemplate';

const SKILL_RANK: Record<DiySkillLevel, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };

// ── Formula evaluator for material quantities ─────────────────────────────────
function evalQuantityFormula(formula: string, _propertyData: Record<string, number>): number {
  if (/^\d+(\.\d+)?$/.test(formula.trim())) return parseFloat(formula.trim());
  try {
    // Only allow safe numeric expressions
    const safe = formula.replace(/[^0-9+\-*/().\s]/g, '');
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${safe})`)();
    return typeof result === 'number' && isFinite(result) ? result : 1;
  } catch {
    return 1;
  }
}

// What the admin screens show of a template's live (published head) revision: its number, whether it was reviewed or backfilled, and when it went live.
const LIVE_REVISION_SELECT = { revision: true, provenance: true, publishedAt: true } as const;

// The next version of a row: the clock, but always strictly after the previous version so a token can never repeat.
const nextVersion = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));

// A project accepts step changes, completion and abandonment only while it is open.
const OPEN_PROJECT_STATUSES: DiyProjectStatus[] = ['PLANNING', 'IN_PROGRESS'];

// Template fields that are not reviewed content: merchandising order and an AI prompt hint. Editing them never forces a new revision.
const NON_CONTENT_TEMPLATE_FIELDS = new Set(['featuredOrder', 'geminiPromptHint']);

export class DiyService {
  // ── Skill Profile ─────────────────────────────────────────────────────────────
  async getSkillProfile(userId: string) {
    return prisma.diySkillProfile.findUnique({ where: { userId } });
  }

  async upsertSkillProfile(userId: string, payload: any) {
    const now = payload.assessedAt ? new Date(payload.assessedAt) : new Date();
    return prisma.diySkillProfile.upsert({
      where: { userId },
      create: { userId, ...payload, assessedAt: now },
      update: { ...payload, assessedAt: now },
    });
  }

  // ── Template Library ──────────────────────────────────────────────────────────
  async listTemplates(params: {
    category?: string | string[];
    difficulty?: string | string[];
    maxSkillLevel?: DiySkillLevel;
    search?: string;
    limit?: number;
    cursor?: string;
  }) {
    const { category, difficulty, maxSkillLevel, search, limit = 20, cursor } = params;

    const categories = category
      ? (Array.isArray(category) ? category : [category]) as DiyProjectCategory[]
      : undefined;
    const difficulties = difficulty
      ? (Array.isArray(difficulty) ? difficulty : [difficulty]) as any[]
      : undefined;

    // Homeowners see the PUBLISHED HEAD REVISION of a template (never its working copy). "Live" means the template has a head; safety, permit,
    // category, difficulty, skill and search all filter on the revision's own columns, so a draft edit cannot change what is listed.
    const where: Prisma.DiyProjectTemplateWhereInput = {
      publishedRevisionId: { not: null },
      publishedRevision: {
        is: {
          safetyLevel: 'LOW',
          permitRequirement: { in: ['NOT_REQUIRED', 'LIKELY_NOT_REQUIRED'] },
          ...(categories?.length && { category: { in: categories } }),
          ...(difficulties?.length && { difficultyLevel: { in: difficulties } }),
          ...(maxSkillLevel && {
            requiredSkillLevel: {
              in: (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as DiySkillLevel[]).filter(
                (s) => SKILL_RANK[s] <= SKILL_RANK[maxSkillLevel],
              ),
            },
          }),
          ...(search && {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { tags: { has: search } },
            ],
          }),
        },
      },
    };

    const candidates = await prisma.diyProjectTemplate.findMany({
      where,
      orderBy: { publishedRevision: { title: 'asc' } },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: PUBLISHED_REVISION_INCLUDE,
    });

    const hasMore = candidates.length > limit;
    const pageCandidates = candidates.slice(0, limit);
    const templates = pageCandidates
      .filter((template) => template.publishedRevision)
      .map((template) => publishedTemplateSummary(template, template.publishedRevision!))
      .filter((template) =>
        evaluateDiyEligibility({
          title: template.title,
          summary: template.shortDescription,
          category: template.category,
          safetyLevel: template.safetyLevel,
          permitRequirement: template.permitRequirement,
        }).eligible);
    return {
      items: templates,
      nextCursor: hasMore ? pageCandidates[pageCandidates.length - 1]?.id : undefined,
    };
  }

  async getFeaturedTemplates() {
    const templates = await prisma.diyProjectTemplate.findMany({
      where: {
        publishedRevisionId: { not: null },
        featuredOrder: { not: null },
        publishedRevision: {
          is: { safetyLevel: 'LOW', permitRequirement: { in: ['NOT_REQUIRED', 'LIKELY_NOT_REQUIRED'] } },
        },
      },
      orderBy: { featuredOrder: 'asc' },
      include: PUBLISHED_REVISION_INCLUDE,
    });
    return templates
      .filter((template) => template.publishedRevision)
      .map((template) => publishedTemplateSummary(template, template.publishedRevision!))
      .filter((template) =>
        evaluateDiyEligibility({
          title: template.title,
          summary: template.shortDescription,
          category: template.category,
          safetyLevel: template.safetyLevel,
          permitRequirement: template.permitRequirement,
        }).eligible);
  }

  async getTemplateDetail(templateId: string) {
    const template = await prisma.diyProjectTemplate.findFirst({
      where: { id: templateId, publishedRevisionId: { not: null } },
      include: PUBLISHED_REVISION_INCLUDE,
    });
    if (!template?.publishedRevision) throw new APIError('Template not found', 404);
    const detail = publishedTemplateDetail(template, template.publishedRevision);
    const eligibility = evaluateDiyEligibility({
      title: detail.title,
      summary: detail.shortDescription,
      category: detail.category,
      safetyLevel: detail.safetyLevel,
      permitRequirement: detail.permitRequirement,
    });
    if (!eligibility.eligible) {
      throw new APIError(
        'This template is not eligible for homeowner DIY.',
        409,
        'DIY_NOT_LOW_RISK',
        { eligibility },
      );
    }
    return detail;
  }

  async createProject(
    propertyId: string,
    userId: string,
    payload: {
      templateId?: string;
      aiGuideId?: string;
      maintenanceTaskId?: string;
      incidentId?: string;
      inventoryItemId?: string;
      decisionVerdict?: any;
      decisionScoreJson?: any;
    },
  ) {
    const { templateId, aiGuideId } = payload;

    // The template branch is the one transactional authority shared with Ask (startProjectFromTemplate). This page path keeps its broad payload (links,
    // verdict, score) and translates the "already open" outcome to a 409 carrying only the existing project's id.
    if (templateId) {
      const result = await this.startProjectFromTemplate(propertyId, templateId, {
        actorUserId: userId,
        requireGoverned: false,
        extras: {
          decisionVerdict: payload.decisionVerdict,
          decisionScoreJson: payload.decisionScoreJson,
          maintenanceTaskId: payload.maintenanceTaskId,
          incidentId: payload.incidentId,
          inventoryItemId: payload.inventoryItemId,
        },
      });
      if (result.outcome === 'ALREADY_OPEN') {
        throw new APIError('You already have an open project from this template.', 409, 'DIY_PROJECT_ALREADY_OPEN', { projectId: result.project.id });
      }
      return result.project;
    }

    // A linked maintenance task must exist and belong to THIS property. `maintenanceTaskId` is a plain string (no foreign key), and both the completion
    // effects and the reverse reconciliation trust the link, so it is checked when it is made. A task that is already completed is allowed: the project
    // then shows "needs review" until it is finished (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.5).
    if (payload.maintenanceTaskId) {
      const linked = await prisma.propertyMaintenanceTask.findFirst({ where: { id: payload.maintenanceTaskId, propertyId }, select: { id: true } });
      if (!linked) throw new APIError('The linked maintenance task was not found for this property.', 404, 'DIY_TASK_NOT_FOUND');
    }

    if (aiGuideId) {
      const guide = await prisma.diyAiGuide.findFirst({ where: { id: aiGuideId, propertyId } });
      if (!guide || guide.status !== 'COMPLETED') throw new APIError('AI guide not ready', 400);
      // CAP-803: AI output is advisory. Project creation independently
      // re-evaluates persisted safety, permit, verdict, and excluded-work
      // facts so unknown or unsafe output fails closed on direct API calls.
      const eligibility = evaluateDiyEligibility({
        title: guide.generatedTitle ?? guide.userPrompt,
        summary: guide.generatedSummary,
        category: guide.category ?? 'OTHER',
        safetyLevel: guide.safetyLevel,
        permitRequirement: guide.permitRequirement,
        verdict: guide.decisionVerdict,
        safetyWarnings: Array.isArray(guide.safetyWarningsJson)
          ? guide.safetyWarningsJson.filter((warning): warning is string => typeof warning === 'string')
          : [],
      });
      if (!eligibility.eligible) {
        throw new APIError(
          'Only reviewed, low-risk, non-regulated work can be started as a DIY project.',
          409,
          'DIY_NOT_LOW_RISK',
          { eligibility },
        );
      }
      const context = await getPropertyContext(
        propertyId,
        { userId },
        { scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY'] },
      );
      const applicability = evaluateDiyApplicability(context, guide.category ?? 'OTHER');
      if (applicability.status !== 'APPLICABLE') {
        throw new APIError(
          'This DIY project is not applicable to the selected property.',
          409,
          'DIY_PROPERTY_NOT_APPLICABLE',
          { applicability },
        );
      }

      const stepsJson = (guide.stepsJson as any[]) ?? [];
      const materialsJson = (guide.materialsJson as any[]) ?? [];
      const toolsJson = (guide.toolsJson as any[]) ?? [];

      return prisma.$transaction(async (tx) => {
        const project = await tx.diyProject.create({
          data: {
            propertyId,
            userId,
            aiGuideId,
            title: guide.generatedTitle ?? 'Custom DIY Project',
            description: guide.generatedSummary,
            category: guide.category ?? 'OTHER',
            status: 'PLANNING',
            decisionVerdict: guide.decisionVerdict ?? null,
            maintenanceTaskId: payload.maintenanceTaskId ?? null,
            incidentId: payload.incidentId ?? null,
            inventoryItemId: payload.inventoryItemId ?? null,
          },
        });

        if (stepsJson.length > 0) {
          await tx.diyProjectStep.createMany({
            data: stepsJson.map((s: any) => ({
              projectId: project.id,
              stepNumber: s.stepNumber,
              title: s.title,
              description: s.description,
              estimatedMinutes: s.estimatedMinutes ?? null,
              safetyNote: s.safetyNote ?? null,
              tipNote: s.tipNote ?? null,
              isOptional: false,
              status: 'PENDING',
            })),
          });
        }

        if (materialsJson.length > 0) {
          await tx.diyProjectMaterial.createMany({
            data: materialsJson.map((m: any) => ({
              projectId: project.id,
              name: m.name,
              unit: m.unit,
              quantity: m.quantity ?? 1,
              unitPriceCents: m.unitPriceCents ?? 0,
              totalEstimateCents: Math.round((m.quantity ?? 1) * (m.unitPriceCents ?? 0)),
              isOptional: false,
              purchaseNote: m.purchaseNote ?? null,
              isPurchased: false,
            })),
          });
        }

        if (toolsJson.length > 0) {
          await tx.diyProjectTool.createMany({
            data: toolsJson.map((t: any) => ({
              projectId: project.id,
              name: t.name,
              isRequired: t.isRequired ?? true,
              defaultToolAction: t.defaultToolAction ?? 'BUY',
              userToolAction: null,
            })),
          });
        }

        return this.getProjectDetail(project.id, propertyId, tx);
      });
    }

    throw new APIError('templateId or aiGuideId required', 400);
  }

  /**
   * The ONE transactional authority for starting a project from a template (docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md section 3). The page and Ask
   * both call it. Inside one transaction, in this order: (1) the actor's CONTRIBUTOR role (so a revoked member learns nothing, not even that a project exists);
   * (2) a transaction-scoped advisory lock on the (property, template) key, which serializes concurrent starts (no unique constraint exists over open
   * projects, and the revision's share lock does not serialize two creations); (3) the duplicate check, open meaning PLANNING or IN_PROGRESS; (4) the
   * published head revision, share-locked in the governance writers' order, then integrity, eligibility and property applicability, the property context read
   * on this same transaction; (5) the skill profile and the create. Nothing the caller saw earlier (a card, a page load) is trusted.
   *
   * Returns ALREADY_OPEN with the existing (earliest) project when one is open; the caller chooses how to present that (the page: 409; Ask: a receipt).
   */
  async startProjectFromTemplate(
    propertyId: string,
    templateId: string,
    ctx: {
      actorUserId: string;
      // Ask: only a governed, hash-verified revision. The page also accepts a legacy-backfill revision.
      requireGoverned: boolean;
      // Ask: the head revision the person reviewed on the confirmation. A different head at confirmation time is refused (409 DIY_TEMPLATE_CHANGED), never started silently.
      expectedRevisionId?: string;
      // Page-only extras; Ask never passes them.
      extras?: {
        decisionVerdict?: any;
        decisionScoreJson?: any;
        maintenanceTaskId?: string;
        incidentId?: string;
        inventoryItemId?: string;
      };
    },
  ): Promise<{ outcome: 'CREATED' | 'ALREADY_OPEN'; project: NonNullable<Awaited<ReturnType<DiyService['getProjectDetail']>>> }> {
    const extras = ctx.extras ?? {};
    return prisma.$transaction(async (tx) => {
      if (!(await hasPropertyRoleWithin(tx, ctx.actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You do not have access to start a project on this property.', 403, 'DIY_ACCESS_REVOKED');
      }

      // $executeRaw, not $queryRaw: the function returns void, which Prisma's query path cannot deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`diy-start:${propertyId}:${templateId}`}, 0))`;

      const existing = await tx.diyProject.findFirst({
        where: { propertyId, templateId, status: { in: OPEN_PROJECT_STATUSES } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (existing) {
        const project = await this.getProjectDetail(existing.id, propertyId, tx);
        return { outcome: 'ALREADY_OPEN' as const, project: project! };
      }

      // The page's link check keeps its place before the template read (a bad link is reported first), now inside the transaction.
      if (extras.maintenanceTaskId) {
        const linked = await tx.propertyMaintenanceTask.findFirst({ where: { id: extras.maintenanceTaskId, propertyId }, select: { id: true } });
        if (!linked) throw new APIError('The linked maintenance task was not found for this property.', 404, 'DIY_TASK_NOT_FOUND');
      }

      // Governance rows are locked in the writers' order (revision, then template) once the head's id is known, then the head is read again: a
      // withdrawal or re-revision that committed first is seen, and one that has not blocks until this transaction ends.
      const first = await tx.diyProjectTemplate.findFirst({ where: { id: templateId, publishedRevisionId: { not: null } }, select: { id: true, publishedRevisionId: true } });
      if (!first) throw new APIError('Template not found', 404);
      await shareLockGovernanceRows(tx, { revisionId: first.publishedRevisionId, templateId: first.id });
      const template = await tx.diyProjectTemplate.findFirst({ where: { id: templateId, publishedRevisionId: { not: null } }, include: PUBLISHED_REVISION_INCLUDE });
      const revision = template?.publishedRevision;
      if (!template || !revision) throw new APIError('Template not found', 404);
      if (revision.id !== first.publishedRevisionId) throw new APIError('This template is temporarily unavailable.', 409, 'DIY_TEMPLATE_UNAVAILABLE');
      if (ctx.expectedRevisionId && revision.id !== ctx.expectedRevisionId) throw new APIError('This project template was updated after you reviewed it.', 409, 'DIY_TEMPLATE_CHANGED');

      const verdict = evaluateTemplateStart(revision, { requireGoverned: ctx.requireGoverned, decisionVerdict: extras.decisionVerdict });
      if (!verdict.ok) {
        if (verdict.code === 'DIY_TEMPLATE_UNAVAILABLE') {
          logger.error({ templateId, revisionId: revision.id, integrity: verdict.integrity }, '[DIY] template revision not startable; refusing to start a project from it');
          throw new APIError(verdict.message, verdict.status, verdict.code);
        }
        throw new APIError(verdict.message, verdict.status, verdict.code, { eligibility: verdict.eligibility });
      }

      // The property's facts are read on THIS transaction, after authorization and the lock (the shared-client authorize is skipped; the role check above is the authority).
      const context = await getPropertyContext(
        propertyId,
        { userId: ctx.actorUserId },
        { scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY'] },
        undefined,
        tx,
      );
      const applicability = evaluateDiyApplicability(context, revision.category);
      if (applicability.status !== 'APPLICABLE') {
        throw new APIError('This DIY project is not applicable to the selected property.', 409, 'DIY_PROPERTY_NOT_APPLICABLE', { applicability });
      }

      const skillProfile = await tx.diySkillProfile.findUnique({ where: { userId: ctx.actorUserId } });
      const ownedTools: string[] = Array.isArray(skillProfile?.toolsOwnedJson) ? skillProfile.toolsOwnedJson as string[] : [];
      const content = revisionContent(revision);

      const project = await tx.diyProject.create({
        data: {
          propertyId,
          userId: ctx.actorUserId,
          templateId,
          templateRevisionId: revision.id,
          title: revision.title,
          description: revision.shortDescription,
          category: revision.category,
          status: 'PLANNING',
          decisionVerdict: extras.decisionVerdict ?? null,
          decisionScoreJson: extras.decisionScoreJson ?? undefined,
          maintenanceTaskId: extras.maintenanceTaskId ?? null,
          incidentId: extras.incidentId ?? null,
          inventoryItemId: extras.inventoryItemId ?? null,
        },
      });

      await tx.diyProjectStep.createMany({
        data: content.steps.map((s: any) => ({
          projectId: project.id,
          templateStepId: stepSnapshotId(revision.id, Number(s.stepNumber)),
          stepNumber: s.stepNumber,
          title: s.title,
          description: s.description,
          estimatedMinutes: s.estimatedMinutes,
          safetyNote: s.safetyNote,
          tipNote: s.tipNote,
          isOptional: s.isOptional,
          status: 'PENDING',
        })),
      });

      await tx.diyProjectMaterial.createMany({
        data: content.materials.map((m: any) => {
          const quantity = evalQuantityFormula(m.quantityFormula, {});
          return {
            projectId: project.id,
            name: m.name,
            unit: m.unit,
            quantity,
            unitPriceCents: m.unitPriceCents,
            totalEstimateCents: Math.round(quantity * m.unitPriceCents),
            isOptional: m.isOptional,
            purchaseNote: m.purchaseNote,
            isPurchased: false,
          };
        }),
      });

      await tx.diyProjectTool.createMany({
        data: content.tools.map((t: any) => ({
          projectId: project.id,
          name: t.name,
          canonicalId: t.canonicalId,
          isRequired: t.isRequired,
          defaultToolAction: t.defaultToolAction,
          userToolAction: t.canonicalId && ownedTools.includes(t.canonicalId) ? 'ALREADY_OWNED' : null,
          rentDailyPriceCents: t.rentDailyPriceCents,
          buyEstimatePriceCents: t.buyEstimatePriceCents,
        })),
      });

      const detail = await this.getProjectDetail(project.id, propertyId, tx);
      return { outcome: 'CREATED' as const, project: detail! };
    }, { timeout: 15000 });
  }

  /**
   * Templates a person can start from Ask on this property (docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md section 3.2): the strict projection, NOT listTemplates. A
   * published head that is governed, hash-verified, eligible and applicable to this property. Read on the shared client (a card may be stale; the start re-checks everything
   * inside its own transaction). `openProjectId` is the earliest open project already started from the template on this property (a courtesy link, not a gate).
   */
  async listStartableTemplates(propertyId: string, actorUserId: string, options: { templateId?: string; limit?: number } = {}) {
    const limit = options.limit ?? 12;
    const candidates = await prisma.diyProjectTemplate.findMany({
      where: {
        ...(options.templateId ? { id: options.templateId } : {}),
        publishedRevisionId: { not: null },
        publishedRevision: { is: { provenance: 'GOVERNED', safetyLevel: 'LOW', permitRequirement: { in: ['NOT_REQUIRED', 'LIKELY_NOT_REQUIRED'] } } },
      },
      orderBy: { publishedRevision: { title: 'asc' } },
      take: options.templateId ? 1 : 60,
      include: PUBLISHED_REVISION_INCLUDE,
    });
    const reviewed = candidates.filter((template) => template.publishedRevision && evaluateTemplateStart(template.publishedRevision, { requireGoverned: true }).ok);
    if (!reviewed.length) return { items: [], hasMore: false };
    const context = await getPropertyContext(propertyId, { userId: actorUserId }, { scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY'] });
    const applicable = reviewed.filter((template) => evaluateDiyApplicability(context, template.publishedRevision!.category).status === 'APPLICABLE');
    const open = await prisma.diyProject.findMany({
      where: { propertyId, templateId: { in: applicable.map((template) => template.id) }, status: { in: OPEN_PROJECT_STATUSES } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, templateId: true },
    });
    const openByTemplate = new Map<string, string>();
    for (const project of open) if (project.templateId && !openByTemplate.has(project.templateId)) openByTemplate.set(project.templateId, project.id);
    const items = applicable.slice(0, limit).map((template) => {
      const revision = template.publishedRevision!;
      const content = revisionContent(revision);
      return {
        ...publishedTemplateSummary(template, revision),
        revisionId: revision.id,
        stepCount: content.steps.length,
        toolCount: content.tools.length,
        openProjectId: openByTemplate.get(template.id) ?? null,
      };
    });
    return { items, hasMore: applicable.length > limit };
  }

  async listProjects(
    propertyId: string,
    params: { status?: string | string[]; category?: string | string[]; limit?: number; cursor?: string },
  ) {
    const { status, category, limit = 20, cursor } = params;
    const statuses = status ? (Array.isArray(status) ? status : [status]) as DiyProjectStatus[] : undefined;
    const categories = category ? (Array.isArray(category) ? category : [category]) as DiyProjectCategory[] : undefined;

    const projects = await prisma.diyProject.findMany({
      where: {
        propertyId,
        ...(statuses?.length && { status: { in: statuses } }),
        ...(categories?.length && { category: { in: categories } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { steps: { select: { id: true, isOptional: true, status: true } } },
    });

    const hasMore = projects.length > limit;
    if (hasMore) projects.pop();

    const items = projects.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      status: p.status,
      decisionVerdict: p.decisionVerdict,
      requiredStepCount: p.steps.filter((s) => !s.isOptional).length,
      completedStepCount: p.steps.filter((s) => !s.isOptional && s.status === 'COMPLETED').length,
      templateId: p.templateId,
      // Additive: whether the project was started from a reviewed template version (the Ask project guide offers its row action only for those).
      aiGuideId: p.aiGuideId,
      templateRevisionId: p.templateRevisionId,
      startedAt: p.startedAt?.toISOString(),
      completedAt: p.completedAt?.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
  }

  // `db` is the transaction client when the project was created inside a transaction: a row inserted there is not visible to the global client
  // until the transaction commits, so reading it back through the global client made createProject fail with "Project not found" and roll back.
  async getProjectDetail(projectId: string, propertyId: string, db: Pick<Prisma.TransactionClient, 'diyProject'> = prisma) {
    const project = await db.diyProject.findFirst({
      where: { id: projectId, propertyId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        materials: { orderBy: { id: 'asc' } },
        tools: { orderBy: { id: 'asc' } },
        // W3 (AI/DIY — "evidence limitations"): guide-level AI safety
        // warnings and the AI-generated summary were captured at generation
        // time but never surfaced anywhere on the project view — the
        // homeowner saw the same UI whether the plan came from an
        // admin-curated template or an unverified LLM response, with no
        // disclaimer distinguishing the two.
        aiGuide: { select: { generatedSummary: true, safetyWarningsJson: true } },
      },
    });
    if (!project) throw new APIError('Project not found', 404);
    return project;
  }

  /**
   * Everything the Ask project guide needs, read-only and scoped to the property: the project with its steps in authored order, the template revision it
   * recorded (the full row, which the integrity check hashes), and the template's current published head. Returns null when the project is not in this
   * property. It writes nothing (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md section 3.5).
   */
  async getProjectGuideSource(projectId: string, propertyId: string) {
    return this.readGuideSource(prisma, projectId, propertyId, false);
  }

  /** The guide source of the project a step belongs to, scoped to the property (null when the step is not in this property). Read-only. */
  async getProjectGuideSourceForStep(stepId: string, propertyId: string) {
    const row = await prisma.diyProjectStep.findFirst({ where: { id: stepId, project: { propertyId } }, select: { projectId: true } });
    return row ? this.readGuideSource(prisma, row.projectId, propertyId, false) : null;
  }

  /**
   * The same read on any client. With `lockGovernance` (inside a transaction) it first takes a SHARE lock on the revision row and the template row, in the
   * order the governance writers update them (revision, then template), so a withdrawal or supersession cannot commit between this read and the caller's
   * commit. The caller must be inside a transaction when it passes `lockGovernance`.
   */
  private async readGuideSource(db: Prisma.TransactionClient | typeof prisma, projectId: string, propertyId: string, lockGovernance: boolean) {
    const project = await db.diyProject.findFirst({
      where: { id: projectId, propertyId },
      select: {
        id: true, title: true, status: true, category: true, templateId: true, aiGuideId: true, templateRevisionId: true, completionBasis: true, updatedAt: true, maintenanceTaskId: true,
        steps: {
          orderBy: { stepNumber: 'asc' },
          select: { id: true, stepNumber: true, templateStepId: true, title: true, description: true, estimatedMinutes: true, isOptional: true, safetyNote: true, tipNote: true, status: true, updatedAt: true },
        },
      },
    });
    if (!project) return null;
    project.steps = [...project.steps].sort((a, b) => a.stepNumber - b.stepNumber);
    if (lockGovernance) {
      await shareLockGovernanceRows(db as Prisma.TransactionClient, { revisionId: project.templateRevisionId, templateId: project.templateId });
    }
    const revision = project.templateRevisionId ? await db.diyTemplateRevision.findUnique({ where: { id: project.templateRevisionId } }) : null;
    const head = project.templateId ? await db.diyProjectTemplate.findUnique({ where: { id: project.templateId }, select: { publishedRevisionId: true } }) : null;
    return { project, revision, head };
  }

  /**
   * The project plus what is known about (1) the records that follow its completion and (2) the maintenance task it is linked to. READ-ONLY: it never
   * writes, retries or repairs anything.
   */
  async getProjectWithCompletionEffects(projectId: string, propertyId: string) {
    const project = await this.getProjectDetail(projectId, propertyId);
    const event = project.status === 'COMPLETED'
      ? await prisma.domainEvent.findUnique({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) }, select: { status: true } })
      : null;
    return {
      ...project,
      completionEffects: describeCompletionEffects(project.status, event?.status ?? null, project.completionBasis ?? null),
      taskLink: (await this.readTaskLink(prisma, project)).view,
    };
  }

  /**
   * Just the effect status of one project, for the Ask guide: the completion-effects view (a completed project) and the task-link view (an open one). READ-ONLY, scoped to the
   * property; null when the project is not in it. It never retries or repairs anything.
   */
  async readProjectEffects(projectId: string, propertyId: string) {
    const project = await prisma.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { id: true, propertyId: true, status: true, maintenanceTaskId: true, completionBasis: true } });
    if (!project) return null;
    const event = project.status === 'COMPLETED' ? await prisma.domainEvent.findUnique({ where: { idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId) }, select: { status: true, updatedAt: true } }) : null;
    const link = await this.readTaskLink(prisma, project);
    return {
      status: project.status,
      completionEffects: describeCompletionEffects(project.status, event?.status ?? null, project.completionBasis ?? null),
      taskLink: link.view,
      // The versions of the two events, so a confirmation can tell that the request it was drawn for has since been re-queued and failed AGAIN.
      versions: { completion: event?.updatedAt ? new Date(event.updatedAt).toISOString() : null, task: link.event?.updatedAt ? new Date(link.event.updatedAt).toISOString() : null },
    };
  }

  /**
   * What a finish confirmation needs to say about a project's linked maintenance task, as it is now: no link, the task is gone, it is already complete, or it is open.
   * READ-ONLY. The worker (not this read) decides what happens to it after a completion.
   */
  async getLinkedTaskState(propertyId: string, maintenanceTaskId: string | null): Promise<'NONE' | 'MISSING' | 'COMPLETED' | 'OPEN'> {
    if (!maintenanceTaskId) return 'NONE';
    const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: maintenanceTaskId, propertyId }, select: { status: true } });
    if (!task) return 'MISSING';
    return task.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN';
  }

  /** Reads the linked task and its reconcile event as they are now, and maps them to the disclosure. No writes. */
  private async readTaskLink(db: Prisma.TransactionClient | typeof prisma, project: { id: string; propertyId: string; status: string; maintenanceTaskId: string | null; completionBasis: string | null }) {
    const open = project.status === 'PLANNING' || project.status === 'IN_PROGRESS';
    const task = open && project.maintenanceTaskId
      ? await db.propertyMaintenanceTask.findFirst({ where: { id: project.maintenanceTaskId, propertyId: project.propertyId }, select: { status: true, completionMetadata: true } })
      : null;
    const occurrenceId = task ? occurrenceIdOf(task.completionMetadata) : null;
    const event = task && occurrenceId && project.maintenanceTaskId
      ? await db.domainEvent.findUnique({ where: { idempotencyKey: DIY_TASK_RECONCILE_EVENT_KEY(project.maintenanceTaskId, occurrenceId) }, select: { id: true, status: true, payload: true, updatedAt: true } })
      : null;
    return { view: describeTaskLink({ project, task: task ?? null, event: event ?? null }), event };
  }

  /** Resets one dead-lettered outbox event to PENDING (same row, conditional on status and version), recording who, when and how many times in its payload. */
  private async requeueDeadLetter(db: Prisma.TransactionClient | typeof prisma, event: { id: string; payload: unknown; updatedAt: Date }, actorUserId: string): Promise<{ reset: boolean; count: number }> {
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? (event.payload as Record<string, any>) : {};
    const count = Number(payload.recovery?.count ?? 0) + 1;
    const written = await db.domainEvent.updateMany({
      where: { id: event.id, status: 'DEAD_LETTER', updatedAt: event.updatedAt },
      data: {
        status: 'PENDING', attempts: 0, availableAt: new Date(), lastError: null, processingStartedAt: null, leaseExpiresAt: null, processedAt: null,
        payload: { ...payload, recovery: { count, lastBy: actorUserId, lastAt: new Date().toISOString() } },
      },
    });
    return { reset: written.count === 1, count };
  }

  /**
   * Re-queues the completion effects of a project whose outbox event was DEAD-LETTERED (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md
   * section 3.5). Only a dead letter qualifies: an event that is still retrying is never reset (that would hide its retry count and could postpone
   * dead-lettering indefinitely), and a pending, processing or processed one is left alone. It resets the SAME row, conditional on its status and
   * version so two requests reset it once, and records who and when (and how many times) in the event's own payload. It never runs an effect: the
   * worker is the only trigger.
   */
  async retryCompletionEffects(projectId: string, propertyId: string, actorUserId: string) {
    // The WHOLE decision is one transaction: the role check, the project and event lookup, the eligibility check and the conditional re-queue (step 7C, plan section 4).
    return prisma.$transaction(async (tx) => {
      if (!(await hasPropertyRoleWithin(tx, actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You do not have access to change this project.', 403, 'DIY_ACCESS_REVOKED');
      }
      const project = await tx.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { id: true, status: true, completionBasis: true } });
      if (!project) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');

      const key = DIY_COMPLETION_EVENT_KEY(projectId);
      const event = project.status === 'COMPLETED' ? await tx.domainEvent.findUnique({ where: { idempotencyKey: key } }) : null;
      let reset = false;
      if (event && event.status === 'DEAD_LETTER') {
        const result = await this.requeueDeadLetter(tx, event, actorUserId);
        reset = result.reset;
        if (reset) logger.info({ projectId, eventId: event.id, actorUserId, recoveryCount: result.count }, '[DIY] completion effects re-queued from a dead letter');
      }
      const current = project.status === 'COMPLETED' ? await tx.domainEvent.findUnique({ where: { idempotencyKey: key }, select: { status: true } }) : null;
      return { reset, completionEffects: describeCompletionEffects(project.status, current?.status ?? null, project.completionBasis ?? null) };
    });
  }

  /**
   * Re-queues the reconciliation request of a project's linked task when it was DEAD-LETTERED and this project's own outcome is not already final
   * (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.4). The event is found through the task's stored occurrence id. The same rules as
   * `retryCompletionEffects`: dead letters only, the same row once, who and when recorded in its payload; the worker is the only trigger and, because it skips
   * every project that already has a final outcome, it re-drives only what failed.
   */
  async retryTaskReconciliation(projectId: string, propertyId: string, actorUserId: string) {
    // One transaction for the whole decision, as for the completion effects: role, lookups, eligibility and the conditional re-queue.
    return prisma.$transaction(async (tx) => {
      if (!(await hasPropertyRoleWithin(tx, actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You do not have access to change this project.', 403, 'DIY_ACCESS_REVOKED');
      }
      const project = await tx.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { id: true, propertyId: true, status: true, maintenanceTaskId: true, completionBasis: true } });
      if (!project) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');

      const before = await this.readTaskLink(tx, project);
      let reset = false;
      if (before.view?.canRecover && before.event && before.event.status === 'DEAD_LETTER') {
        const result = await this.requeueDeadLetter(tx, before.event, actorUserId);
        reset = result.reset;
        if (reset) logger.info({ projectId, eventId: before.event.id, actorUserId, recoveryCount: result.count }, '[DIY] task reconciliation re-queued from a dead letter');
      }
      return { reset, taskLink: (await this.readTaskLink(tx, project)).view };
    });
  }

  async updateProject(projectId: string, propertyId: string, patch: { notesJson?: any; photoUrls?: string[] }) {
    const existing = await prisma.diyProject.findFirst({ where: { id: projectId, propertyId } });
    if (!existing) throw new APIError('Project not found', 404);
    return prisma.diyProject.update({ where: { id: projectId }, data: patch });
  }

  // ── Step and project transitions ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md. Every transition is one transaction that first CLAIMS the project row with a conditional
  // write, so steps and completion queue behind each other, runs against the committed state, records the acting user, and leaves a ledger row. A
  // caller supplies the version token it last saw (`expectedUpdatedAt`); a stale one is refused, never overwritten.

  /** The version token a request must carry. Required: a missing or malformed one is a client error, not a silent "latest wins". */
  private parseVersionToken(value: unknown): Date {
    const date = typeof value === 'string' || value instanceof Date ? new Date(value as string) : null;
    if (!date || Number.isNaN(date.getTime())) throw new APIError('This request must carry the expectedUpdatedAt version it was based on.', 400, 'DIY_TOKEN_REQUIRED');
    return date;
  }

  /**
   * Locks and bumps the project row if it is open (and, when given, still at the caller's version). It reads the current version and writes
   * conditionally on it, so two claims can never both succeed from the same version, and the new version is always strictly greater than the old
   * (a clock-only version could repeat within one millisecond).
   */
  private async claimOpenProject(tx: Prisma.TransactionClient, projectId: string, propertyId: string, expected?: Date) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await tx.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { status: true, updatedAt: true } });
      if (!current) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');
      if (!OPEN_PROJECT_STATUSES.includes(current.status)) {
        throw new APIError('This project is already finished and can no longer be changed.', 409, 'DIY_PROJECT_CLOSED', { status: current.status });
      }
      if (expected && current.updatedAt.getTime() !== expected.getTime()) {
        throw new APIError('This project changed while you were working. Reload it and try again.', 409, 'DIY_STALE', { status: current.status, updatedAt: current.updatedAt.toISOString() });
      }
      const claimed = await tx.diyProject.updateMany({
        where: { id: projectId, propertyId, status: current.status, updatedAt: current.updatedAt },
        data: { updatedAt: nextVersion(current.updatedAt) },
      });
      if (claimed.count === 1) return;
    }
    throw new APIError('This project is being changed by someone else. Try again in a moment.', 409, 'DIY_STALE');
  }

  async updateStep(
    projectId: string,
    propertyId: string,
    stepId: string,
    patch: { status: DiyStepStatusValue; notes?: string },
    ctx: { actorUserId: string; expectedUpdatedAt?: unknown; askPolicy?: AskStepPolicyName },
  ) {
    const expected = this.parseVersionToken(ctx.expectedUpdatedAt);
    return prisma.$transaction(async (tx) => {
      // Authorization is decided inside the transaction that depends on it, before anything else (an idempotent "already" included): a revocation
      // between the caller's own checks and this write must not be honored.
      if (!(await hasPropertyRoleWithin(tx, ctx.actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You do not have access to change this project.', 403, 'DIY_ACCESS_REVOKED');
      }
      const findStep = () => tx.diyProjectStep.findFirst({ where: { id: stepId, projectId, project: { propertyId } } });
      const wantsNotes = (step: { notes: string | null; status: DiyStepStatusValue }) =>
        patch.notes !== undefined && patch.notes !== (step.notes ?? '') && (step.status === 'PENDING' || step.status === 'IN_PROGRESS');

      const before = await findStep();
      if (!before) throw new APIError('Step not found', 404, 'STEP_NOT_FOUND');
      // Idempotent by resulting state: already there (a double click, a retry), whatever the caller's version.
      if (before.status === patch.status && !wantsNotes(before as any)) return { step: before, alreadyApplied: true };

      await this.claimOpenProject(tx, projectId, propertyId);
      const step = await findStep(); // re-read now that the project row is held
      if (!step) throw new APIError('Step not found', 404, 'STEP_NOT_FOUND');
      if (step.status === patch.status && !wantsNotes(step as any)) return { step, alreadyApplied: true };
      if (step.updatedAt.getTime() !== expected.getTime()) {
        throw new APIError('This step changed while you were working. Reload and try again.', 409, 'DIY_STALE', { status: step.status, updatedAt: step.updatedAt.toISOString() });
      }

      // Ask's narrower rules, evaluated against the snapshot read inside this transaction after the project row is held (the transition table below
      // still performs the actual transition).
      if (ctx.askPolicy) {
        const source = await this.readGuideSource(tx, projectId, propertyId, true);
        if (!source) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');
        const policy = evaluateAskStepPolicy(source as any, stepId, patch.status, ctx.askPolicy);
        if (!policy.ok) throw new APIError(policy.message, 409, policy.code, { reason: policy.reason });
      }

      const notesOnly = step.status === patch.status;
      const decision = notesOnly ? ({ kind: 'ALLOWED', event: null } as const) : evaluateStepTransition(step as any, patch.status);
      if (decision.kind === 'REFUSED') {
        const message = decision.reason === 'SKIP_REQUIRED_STEP' ? 'A required step cannot be skipped.'
          : decision.reason === 'SKIP_SAFETY_STEP' ? 'A step with a safety note cannot be skipped.'
            : `A ${step.status.toLowerCase().replace('_', ' ')} step cannot be changed to ${patch.status.toLowerCase().replace('_', ' ')}.`;
        throw new APIError(message, 409, 'DIY_STEP_TRANSITION_NOT_ALLOWED', { reason: decision.reason, status: step.status });
      }
      if (decision.kind !== 'ALLOWED') return { step, alreadyApplied: true };

      const now = new Date();
      const completing = patch.status === 'COMPLETED' && !notesOnly;
      const reopening = decision.event === 'STEP_REOPENED';
      const written = await tx.diyProjectStep.updateMany({
        where: { id: step.id, projectId, status: step.status, updatedAt: step.updatedAt },
        data: {
          status: patch.status,
          notes: patch.notes ?? step.notes,
          ...(completing ? { completedAt: now, completedByUserId: ctx.actorUserId } : {}),
          ...(reopening ? { completedAt: null, completedByUserId: null } : {}),
          updatedAt: nextVersion(step.updatedAt),
        },
      });
      if (written.count === 0) {
        throw new APIError('This step changed while you were working. Reload and try again.', 409, 'DIY_STALE', { status: step.status, updatedAt: step.updatedAt.toISOString() });
      }
      // The first activity on a step starts the project.
      if (!notesOnly && step.status === 'PENDING') {
        await tx.diyProject.updateMany({ where: { id: projectId, status: 'PLANNING' }, data: { status: 'IN_PROGRESS', startedAt: now } });
      }
      if (decision.event) {
        await tx.diyProjectEvent.create({
          data: { projectId, stepId: step.id, actorUserId: ctx.actorUserId, type: decision.event, fromStatus: step.status, toStatus: patch.status },
        });
      }
      return { step: (await findStep())!, alreadyApplied: false };
    });
  }

  async completeProject(
    projectId: string,
    propertyId: string,
    payload: { actualMinutes?: number; actualMaterialCostCents?: number; notes?: string },
    ctx: { actorUserId: string; expectedUpdatedAt?: unknown; askPolicy?: 'COMPLETE_PROJECT' },
  ) {
    const expected = this.parseVersionToken(ctx.expectedUpdatedAt);
    return prisma.$transaction(async (tx) => {
      // Authorization of record: decided here, inside the transaction that writes the completion and its outbox row, not only by the route middleware
      // that ran before it (so a revocation in between is refused). The worker later relies on this and uses the actor only for attribution.
      if (!(await hasPropertyRoleWithin(tx, ctx.actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You no longer have access to complete this project.', 403, 'DIY_ACCESS_REVOKED');
      }
      await this.claimOpenProject(tx, projectId, propertyId, expected);
      // Ask's narrower rule, on a guide source read inside this transaction after the project row is held, with the governance rows share-locked (as for a step command).
      if (ctx.askPolicy) {
        const source = await this.readGuideSource(tx, projectId, propertyId, true);
        if (!source) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');
        const policy = evaluateAskProjectPolicy(source as any, ctx.askPolicy);
        if (!policy.ok) throw new APIError(policy.message, 409, policy.code, { reason: policy.reason });
      }
      // The rule is checked against the steps as they are NOW, in this transaction, with the project row held: no step can change underneath it.
      const open = await this.openStepsWithin(tx, projectId);
      if (open.length > 0) throw this.stepsIncompleteError(open);
      return this.writeCompletion(tx, { projectId, propertyId, actorUserId: ctx.actorUserId, payload, basis: 'STEPS' });
    });
  }

  private async openStepsWithin(tx: Prisma.TransactionClient, projectId: string) {
    const steps = await tx.diyProjectStep.findMany({
      where: { projectId }, orderBy: { stepNumber: 'asc' }, select: { id: true, stepNumber: true, title: true, isOptional: true, status: true },
    });
    return openStepsForCompletion(steps as any) as Array<{ id: string; stepNumber: number; title: string; isOptional: boolean; status: string }>;
  }

  private stepsIncompleteError(open: Array<{ id: string; stepNumber: number; title: string; isOptional: boolean; status: string }>) {
    return new APIError(
      `${open.length} ${open.length === 1 ? 'step is' : 'steps are'} still open. Complete required steps, and complete or skip optional ones, before finishing the project.`,
      409,
      'DIY_PROJECT_STEPS_INCOMPLETE',
      { openSteps: open.map((step) => ({ id: step.id, stepNumber: step.stepNumber, title: step.title, isOptional: step.isOptional, status: step.status })) },
    );
  }

  /** The completion write, its ledger row and its outbox event, after the project row has been claimed and the completion rule has held. */
  private async writeCompletion(
    tx: Prisma.TransactionClient,
    input: { projectId: string; propertyId: string; actorUserId: string; payload: { actualMinutes?: number; actualMaterialCostCents?: number; notes?: string }; basis: 'STEPS' | 'LINKED_TASK' },
  ) {
    const { projectId, propertyId, actorUserId, payload } = input;
    const project = await tx.diyProject.findFirst({ where: { id: projectId, propertyId } });
    if (!project) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');
    const now = new Date();
    const notesJson = payload.notes
      ? [...((project.notesJson as any[]) ?? []), { text: payload.notes, createdAt: now.toISOString() }]
      : project.notesJson;
    const completed = await tx.diyProject.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        completedByUserId: actorUserId,
        completionBasis: input.basis,
        actualMinutes: payload.actualMinutes ?? null,
        actualMaterialCostCents: payload.actualMaterialCostCents ?? null,
        notesJson: notesJson ?? undefined,
      },
    });
    await tx.diyProjectEvent.create({
      data: { projectId, actorUserId, type: 'PROJECT_COMPLETED', fromStatus: project.status, toStatus: 'COMPLETED' },
    });
    // The outbox row, in the SAME transaction: a snapshot of what was completed. If this insert fails the whole completion rolls back, so there is
    // never a completed project without its record. A worker creates the home event and completes the linked maintenance task from this payload
    // (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md). Incidents are not touched (decision O13).
    await DomainEventsService.emit({
      type: 'DIY_PROJECT_COMPLETED',
      propertyId,
      userId: actorUserId,
      idempotencyKey: DIY_COMPLETION_EVENT_KEY(projectId),
      payload: {
        projectId,
        propertyId,
        actorUserId,
        completedAt: now.toISOString(),
        title: project.title,
        category: project.category,
        actualMinutes: payload.actualMinutes ?? null,
        actualMaterialCostCents: payload.actualMaterialCostCents ?? null,
        maintenanceTaskId: project.maintenanceTaskId ?? null,
      },
    }, tx);
    return completed;
  }

  /**
   * Applies the approved O12 rules to ONE open project whose linked maintenance task was completed elsewhere (docs/architecture/
   * ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.2). The mode is exactly what the completion recorded; an unknown mode is never inferred and changes
   * nothing. Every change is one transaction behind the step 2 claim (so it serializes with the person's own writes and bumps the version), with a ledger
   * row attributed to the person who completed the task. Authorization was verified in the transaction that completed the task; this is system-driven.
   */
  async reconcileProjectFromLinkedTask(
    projectId: string,
    propertyId: string,
    input: { mode: 'DIY' | 'PROVIDER' | null; actorUserId: string; completedAt: Date },
  ): Promise<'HIRED_OUT' | 'COMPLETED' | 'CLOSED_BY_LINKED_TASK' | 'NEEDS_REVIEW' | 'ALREADY_CLOSED' | 'PROJECT_GONE'> {
    if (input.mode === null) return 'NEEDS_REVIEW';
    try {
      return await prisma.$transaction(async (tx) => {
        await this.claimOpenProject(tx, projectId, propertyId);
        const before = await tx.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { status: true } });
        if (input.mode === 'PROVIDER') {
          await tx.diyProject.update({ where: { id: projectId }, data: { status: 'HIRED_OUT', abandonedAt: new Date(), completionBasis: 'LINKED_TASK' } });
          await tx.diyProjectEvent.create({
            data: { projectId, actorUserId: input.actorUserId, type: 'PROJECT_HIRED_OUT', fromStatus: before?.status ?? null, toStatus: 'HIRED_OUT' },
          });
          return 'HIRED_OUT' as const;
        }
        const open = await this.openStepsWithin(tx, projectId);
        if (open.length === 0) {
          // The same governed completion a person would make, including its outbox event (the home event), with the same basis.
          await this.writeCompletion(tx, { projectId, propertyId, actorUserId: input.actorUserId, payload: {}, basis: 'STEPS' });
          return 'COMPLETED' as const;
        }
        // Reconciled closure: the linked task is the evidence. Steps are left exactly as they were and no home event is written.
        await tx.diyProject.update({
          where: { id: projectId },
          data: { status: 'COMPLETED', completedAt: input.completedAt, completedByUserId: input.actorUserId, completionBasis: 'LINKED_TASK' },
        });
        await tx.diyProjectEvent.create({
          data: { projectId, actorUserId: input.actorUserId, type: 'PROJECT_CLOSED_BY_LINKED_TASK', fromStatus: before?.status ?? null, toStatus: 'COMPLETED' },
        });
        return 'CLOSED_BY_LINKED_TASK' as const;
      });
    } catch (error: any) {
      if (error?.code === 'DIY_PROJECT_CLOSED') return 'ALREADY_CLOSED';
      if (error?.code === 'PROJECT_NOT_FOUND') return 'PROJECT_GONE';
      throw error;
    }
  }

  async abandonProject(
    projectId: string,
    propertyId: string,
    hireOut: boolean,
    ctx: { actorUserId: string; expectedUpdatedAt?: unknown },
  ) {
    const expected = this.parseVersionToken(ctx.expectedUpdatedAt);
    return prisma.$transaction(async (tx) => {
      // Authorization decided inside the transaction that writes the change, for every caller (the page too): a revocation between the route's check and this write is refused.
      if (!(await hasPropertyRoleWithin(tx, ctx.actorUserId, propertyId, 'CONTRIBUTOR'))) {
        throw new APIError('You do not have access to change this project.', 403, 'DIY_ACCESS_REVOKED');
      }
      await this.claimOpenProject(tx, projectId, propertyId, expected);
      const before = await tx.diyProject.findFirst({ where: { id: projectId, propertyId }, select: { status: true } });
      const status = hireOut ? 'HIRED_OUT' : 'ABANDONED';
      const updated = await tx.diyProject.update({ where: { id: projectId }, data: { status, abandonedAt: new Date() } });
      await tx.diyProjectEvent.create({
        data: { projectId, actorUserId: ctx.actorUserId, type: hireOut ? 'PROJECT_HIRED_OUT' : 'PROJECT_ABANDONED', fromStatus: before?.status ?? null, toStatus: status },
      });
      return updated;
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────
  async adminListTemplates(params: { limit?: number; cursor?: string; status?: string; category?: string; search?: string }) {
    const { limit = 50, cursor, status, category, search } = params;
    const statuses = status
      ? [status as DiyTemplateStatus]
      : (['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'ARCHIVED'] as DiyTemplateStatus[]);

    const templates = await prisma.diyProjectTemplate.findMany({
      where: {
        status: { in: statuses },
        ...(category && { category: category as any }),
        ...(search && { title: { contains: search, mode: 'insensitive' as any } }),
      },
      include: { _count: { select: { steps: true } }, publishedRevision: { select: LIVE_REVISION_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = templates.length > limit;
    if (hasMore) templates.pop();
    const items = templates.map(({ _count, publishedRevision, ...t }) => ({ ...t, stepCount: _count.steps, liveRevision: publishedRevision ?? null }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
  }

  async adminGetTemplate(templateId: string) {
    const template = await prisma.diyProjectTemplate.findUnique({
      where: { id: templateId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        materials: { orderBy: { sortOrder: 'asc' } },
        tools: { orderBy: { sortOrder: 'asc' } },
        publishedRevision: { select: LIVE_REVISION_SELECT },
      },
    });
    if (!template) throw new APIError('Template not found', 404);
    const { publishedRevision, ...rest } = template;
    return { ...rest, liveRevision: publishedRevision ?? null };
  }

  async adminCreateTemplate(payload: any) {
    const { steps, materials, tools, ...core } = payload;
    return prisma.$transaction(async (tx) => {
      const template = await tx.diyProjectTemplate.create({
        data: { ...core, status: 'DRAFT' },
      });
      if (steps?.length) await tx.diyTemplateStep.createMany({ data: steps.map((s: any) => ({ ...s, templateId: template.id })) });
      if (materials?.length) await tx.diyTemplateMaterial.createMany({ data: materials.map((m: any) => ({ ...m, templateId: template.id })) });
      if (tools?.length) await tx.diyTemplateTool.createMany({ data: tools.map((t: any) => ({ ...t, templateId: template.id })) });
      return tx.diyProjectTemplate.findUnique({
        where: { id: template.id },
        include: { steps: true, materials: true, tools: true },
      });
    });
  }

  /**
   * Edits a template's WORKING COPY (docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md). Reviewed content is frozen:
   *  - DRAFT: updated in place, as before.
   *  - ACTIVE: updated, and the template atomically becomes DRAFT with its approval cleared; the published head is untouched, so homeowners keep
   *    seeing the reviewed revision until a new one is published.
   *  - REVIEW, APPROVED, ARCHIVED: refused (TEMPLATE_CONTENT_FROZEN); return it to draft first.
   * `featuredOrder` and `geminiPromptHint` are not reviewed content: they change in any status and never force a new revision.
   */
  async adminUpdateTemplate(templateId: string, payload: any) {
    const { steps, materials, tools, ...core } = payload;
    const nonContent: Record<string, unknown> = {};
    const content: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(core)) (NON_CONTENT_TEMPLATE_FIELDS.has(key) ? nonContent : content)[key] = value;
    const touchesContent = Object.keys(content).length > 0 || steps !== undefined || materials !== undefined || tools !== undefined;

    return prisma.$transaction(async (tx) => {
      // The admin form always sends the whole template, so a save that only changes featuredOrder still carries every content field. Compare what
      // would be stored with what is stored: only a REAL content change is held to the frozen/diverge rules (and only then are child rows replaced).
      const current = await tx.diyProjectTemplate.findUnique({
        where: { id: templateId },
        include: { steps: true, materials: true, tools: true },
      });
      if (!current) throw new APIError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
      const merged = {
        ...current, ...content,
        steps: steps !== undefined ? steps : current.steps,
        materials: materials !== undefined ? materials : current.materials,
        tools: tools !== undefined ? tools : current.tools,
      };
      const changesContent = touchesContent && computeContentHash(buildRevisionContent(merged)) !== computeContentHash(buildRevisionContent(current));

      if (changesContent) {
        // Claim the row before changing anything: a DRAFT stays DRAFT (and the write takes the row, so a concurrent submit cannot slip between
        // this check and the edit); an ACTIVE template diverges to DRAFT with its approval mirror cleared. Anything else is frozen.
        const claimed = (await tx.diyProjectTemplate.updateMany({ where: { id: templateId, status: 'DRAFT' }, data: { status: 'DRAFT' } })).count
          || (await tx.diyProjectTemplate.updateMany({ where: { id: templateId, status: 'ACTIVE' }, data: { status: 'DRAFT', approvedBy: null, approvedAt: null } })).count;
        if (!claimed) {
          const latest = await tx.diyProjectTemplate.findUnique({ where: { id: templateId }, select: { status: true } });
          if (!latest) throw new APIError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
          throw new APIError(
            `This template is ${latest.status} and its reviewed content cannot be edited. ${latest.status === 'ARCHIVED' ? 'Revive it to draft first.' : 'Return it to draft first.'}`,
            409,
            'TEMPLATE_CONTENT_FROZEN',
            { status: latest.status },
          );
        }
      }
      const update = changesContent ? { ...content, ...nonContent } : nonContent;
      if (Object.keys(update).length) await tx.diyProjectTemplate.update({ where: { id: templateId }, data: update });
      if (changesContent && steps !== undefined) {
        await tx.diyTemplateStep.deleteMany({ where: { templateId } });
        if (steps.length) await tx.diyTemplateStep.createMany({ data: steps.map((s: any) => ({ ...s, templateId })) });
      }
      if (changesContent && materials !== undefined) {
        await tx.diyTemplateMaterial.deleteMany({ where: { templateId } });
        if (materials.length) await tx.diyTemplateMaterial.createMany({ data: materials.map((m: any) => ({ ...m, templateId })) });
      }
      if (changesContent && tools !== undefined) {
        await tx.diyTemplateTool.deleteMany({ where: { templateId } });
        if (tools.length) await tx.diyTemplateTool.createMany({ data: tools.map((t: any) => ({ ...t, templateId })) });
      }
      return tx.diyProjectTemplate.findUnique({
        where: { id: templateId },
        include: { steps: true, materials: true, tools: true },
      });
    });
  }

}

export const diyService = new DiyService();
