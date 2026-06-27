// apps/backend/src/services/diy.service.ts
import { Prisma, DiyProjectStatus, DiyProjectCategory, DiyTemplateStatus, DiySkillLevel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { diyCompletionService } from './diyCompletion.service';

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

    const where: Prisma.DiyProjectTemplateWhereInput = {
      status: 'ACTIVE',
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
    };

    const templates = await prisma.diyProjectTemplate.findMany({
      where,
      orderBy: { title: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true, slug: true, title: true, shortDescription: true,
        category: true, difficultyLevel: true, requiredSkillLevel: true,
        safetyLevel: true, estimatedMinutes: true,
        estimatedMaterialCostMinCents: true, estimatedMaterialCostMaxCents: true,
        professionalCostMinCents: true, professionalCostMaxCents: true,
        tags: true, featuredOrder: true,
      },
    });

    const hasMore = templates.length > limit;
    if (hasMore) templates.pop();
    return { items: templates, nextCursor: hasMore ? templates[templates.length - 1]?.id : undefined };
  }

  async getFeaturedTemplates() {
    return prisma.diyProjectTemplate.findMany({
      where: { status: 'ACTIVE', featuredOrder: { not: null } },
      orderBy: { featuredOrder: 'asc' },
      select: {
        id: true, slug: true, title: true, shortDescription: true,
        category: true, difficultyLevel: true, requiredSkillLevel: true,
        safetyLevel: true, estimatedMinutes: true,
        estimatedMaterialCostMinCents: true, estimatedMaterialCostMaxCents: true,
        professionalCostMinCents: true, professionalCostMaxCents: true,
        tags: true, featuredOrder: true,
      },
    });
  }

  async getTemplateDetail(templateId: string) {
    const template = await prisma.diyProjectTemplate.findFirst({
      where: { id: templateId, status: 'ACTIVE' },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        materials: { orderBy: { sortOrder: 'asc' } },
        tools: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!template) throw new APIError('Template not found', 404);
    return template;
  }

  // ── Projects ──────────────────────────────────────────────────────────────────
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
      const template = await prisma.diyProjectTemplate.findFirst({
        where: { id: templateId, status: 'ACTIVE' },
        include: {
          steps: { orderBy: { stepNumber: 'asc' } },
          materials: { orderBy: { sortOrder: 'asc' } },
          tools: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!template) throw new APIError('Template not found', 404);

      return prisma.$transaction(async (tx) => {
        const project = await tx.diyProject.create({
          data: {
            propertyId,
            userId,
            templateId,
            title: template.title,
            description: template.shortDescription,
            category: template.category,
            status: 'PLANNING',
            decisionVerdict: payload.decisionVerdict ?? null,
            decisionScoreJson: payload.decisionScoreJson ?? undefined,
            maintenanceTaskId: payload.maintenanceTaskId ?? null,
            incidentId: payload.incidentId ?? null,
            inventoryItemId: payload.inventoryItemId ?? null,
          },
        });

        await tx.diyProjectStep.createMany({
          data: template.steps.map((s) => ({
            projectId: project.id,
            templateStepId: s.id,
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
          data: template.materials.map((m) => {
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
          data: template.tools.map((t) => ({
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
  async adminListTemplates(params: { limit?: number; cursor?: string; status?: string }) {
    const { limit = 50, cursor, status } = params;
    const statuses = status ? [status as DiyTemplateStatus] : ['DRAFT', 'ACTIVE', 'ARCHIVED'] as DiyTemplateStatus[];

    const templates = await prisma.diyProjectTemplate.findMany({
      where: { status: { in: statuses } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = templates.length > limit;
    if (hasMore) templates.pop();
    return { items: templates, nextCursor: hasMore ? templates[templates.length - 1]?.id : undefined };
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

  async adminUpdateTemplate(templateId: string, payload: any) {
    const { steps, materials, tools, ...core } = payload;
    return prisma.$transaction(async (tx) => {
      if (core && Object.keys(core).length) await tx.diyProjectTemplate.update({ where: { id: templateId }, data: core });
      if (steps !== undefined) {
        await tx.diyTemplateStep.deleteMany({ where: { templateId } });
        if (steps.length) await tx.diyTemplateStep.createMany({ data: steps.map((s: any) => ({ ...s, templateId })) });
      }
      if (materials !== undefined) {
        await tx.diyTemplateMaterial.deleteMany({ where: { templateId } });
        if (materials.length) await tx.diyTemplateMaterial.createMany({ data: materials.map((m: any) => ({ ...m, templateId })) });
      }
      if (tools !== undefined) {
        await tx.diyTemplateTool.deleteMany({ where: { templateId } });
        if (tools.length) await tx.diyTemplateTool.createMany({ data: tools.map((t: any) => ({ ...t, templateId })) });
      }
      return tx.diyProjectTemplate.findUnique({
        where: { id: templateId },
        include: { steps: true, materials: true, tools: true },
      });
    });
  }

  async adminUpdateTemplateStatus(templateId: string, status: DiyTemplateStatus) {
    return prisma.diyProjectTemplate.update({ where: { id: templateId }, data: { status } });
  }
}

export const diyService = new DiyService();
