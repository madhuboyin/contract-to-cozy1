// apps/backend/src/services/diy.service.ts
import { Prisma, DiyProjectStatus, DiyProjectCategory, DiyTemplateStatus, DiySkillLevel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { diyCompletionService } from './diyCompletion.service';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateDiyApplicability } from './diy/applicabilityPolicy';
import { evaluateDiyEligibility } from './diy/eligibilityPolicy';
import { logger } from '../lib/logger';
import { buildRevisionContent, checkRevisionIntegrity, computeContentHash } from './diyTemplateRevision.service';
import {
  PUBLISHED_REVISION_INCLUDE, publishedTemplateDetail, publishedTemplateSummary, revisionContent, stepSnapshotId,
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

    const skillProfile = await prisma.diySkillProfile.findUnique({ where: { userId } });
    const ownedTools: string[] = Array.isArray(skillProfile?.toolsOwnedJson) ? skillProfile.toolsOwnedJson as string[] : [];

    if (templateId) {
      // A project copies the template's PUBLISHED HEAD REVISION, never its working copy, and records which revision it copied.
      const template = await prisma.diyProjectTemplate.findFirst({
        where: { id: templateId, publishedRevisionId: { not: null } },
        include: PUBLISHED_REVISION_INCLUDE,
      });
      const revision = template?.publishedRevision;
      if (!template || !revision) throw new APIError('Template not found', 404);
      // A governed revision must still match its hash. A legacy-backfill revision carries no hash and makes no integrity claim; it is accepted
      // so templates that were live before revisions existed keep working, but it is never presented as reviewed (it is not guideable in Ask).
      if (checkRevisionIntegrity(revision) === 'MISMATCH') {
        logger.error({ templateId, revisionId: revision.id }, '[DIY] published template revision failed its integrity check; refusing to start a project from it');
        throw new APIError('This template is temporarily unavailable.', 409, 'DIY_TEMPLATE_UNAVAILABLE');
      }
      const eligibility = evaluateDiyEligibility({
        title: revision.title,
        summary: revision.shortDescription,
        category: revision.category,
        safetyLevel: revision.safetyLevel,
        permitRequirement: revision.permitRequirement,
        verdict: payload.decisionVerdict,
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
      const applicability = evaluateDiyApplicability(context, revision.category);
      if (applicability.status !== 'APPLICABLE') {
        throw new APIError(
          'This DIY project is not applicable to the selected property.',
          409,
          'DIY_PROPERTY_NOT_APPLICABLE',
          { applicability },
        );
      }
      const content = revisionContent(revision);

      return prisma.$transaction(async (tx) => {
        const project = await tx.diyProject.create({
          data: {
            propertyId,
            userId,
            templateId,
            templateRevisionId: revision.id,
            title: revision.title,
            description: revision.shortDescription,
            category: revision.category,
            status: 'PLANNING',
            decisionVerdict: payload.decisionVerdict ?? null,
            decisionScoreJson: payload.decisionScoreJson ?? undefined,
            maintenanceTaskId: payload.maintenanceTaskId ?? null,
            incidentId: payload.incidentId ?? null,
            inventoryItemId: payload.inventoryItemId ?? null,
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

        return this.getProjectDetail(project.id, propertyId);
      });
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

        return this.getProjectDetail(project.id, propertyId);
      });
    }

    throw new APIError('templateId or aiGuideId required', 400);
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
      startedAt: p.startedAt?.toISOString(),
      completedAt: p.completedAt?.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
  }

  async getProjectDetail(projectId: string, propertyId: string) {
    const project = await prisma.diyProject.findFirst({
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

  async updateProject(projectId: string, propertyId: string, patch: { notesJson?: any; photoUrls?: string[] }) {
    const existing = await prisma.diyProject.findFirst({ where: { id: projectId, propertyId } });
    if (!existing) throw new APIError('Project not found', 404);
    return prisma.diyProject.update({ where: { id: projectId }, data: patch });
  }

  async updateStep(projectId: string, propertyId: string, stepId: string, patch: { status: any; notes?: string }) {
    const project = await prisma.diyProject.findFirst({
      where: { id: projectId, propertyId },
      include: { steps: true },
    });
    if (!project) throw new APIError('Project not found', 404);

    const step = project.steps.find((s) => s.id === stepId);
    if (!step) throw new APIError('Step not found', 404);

    const updates: Prisma.DiyProjectUpdateInput = {};
    if (project.status === 'PLANNING' && patch.status === 'IN_PROGRESS') {
      updates.status = 'IN_PROGRESS';
      updates.startedAt = new Date();
    }

    await prisma.diyProject.update({ where: { id: projectId }, data: updates });

    return prisma.diyProjectStep.update({
      where: { id: stepId },
      data: {
        status: patch.status,
        notes: patch.notes ?? step.notes,
        completedAt: patch.status === 'COMPLETED' ? new Date() : step.completedAt,
      },
    });
  }

  async completeProject(
    projectId: string,
    propertyId: string,
    payload: { actualMinutes?: number; actualMaterialCostCents?: number; notes?: string },
  ) {
    const project = await prisma.diyProject.findFirst({ where: { id: projectId, propertyId } });
    if (!project) throw new APIError('Project not found', 404);
    if (project.status === 'COMPLETED') throw new APIError('Project already completed', 400);

    const now = new Date();
    const notesJson = payload.notes
      ? [...((project.notesJson as any[]) ?? []), { text: payload.notes, createdAt: now.toISOString() }]
      : project.notesJson;

    const updated = await prisma.diyProject.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        actualMinutes: payload.actualMinutes ?? null,
        actualMaterialCostCents: payload.actualMaterialCostCents ?? null,
        notesJson: notesJson ?? undefined,
      },
    });

    await diyCompletionService.onComplete(updated);
    return updated;
  }

  async abandonProject(projectId: string, propertyId: string, hireOut: boolean) {
    const project = await prisma.diyProject.findFirst({ where: { id: projectId, propertyId } });
    if (!project) throw new APIError('Project not found', 404);

    return prisma.diyProject.update({
      where: { id: projectId },
      data: {
        status: hireOut ? 'HIRED_OUT' : 'ABANDONED',
        abandonedAt: new Date(),
      },
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
