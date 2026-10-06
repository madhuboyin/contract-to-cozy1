// apps/backend/src/services/diyPublishedTemplate.ts
//
// What homeowners see of a DIY template (docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md, slice 1c): always the PUBLISHED HEAD REVISION,
// never the editable working copy. Response shapes are those the DIY pages already consume, with the template's own id as `id`. Steps, materials and
// tools come from the revision's stored snapshot and get stable synthetic ids (they have no rows of their own). Admin-only fields on the template row
// (approvedBy, approvedAt, status, geminiPromptHint, timestamps) are not part of a homeowner response.
import type { DiyTemplateRevision, DiyProjectTemplate } from '@prisma/client';
import type { RevisionContentJson } from './diyTemplateRevision.service';

export type PublishedTemplate = DiyProjectTemplate & { publishedRevision: DiyTemplateRevision | null };

/** Selecting the head with the template (the relation `publishedRevision`). */
export const PUBLISHED_REVISION_INCLUDE = { publishedRevision: true } as const;

export const stepSnapshotId = (revisionId: string, stepNumber: number) => `${revisionId}:step:${stepNumber}`;
const materialSnapshotId = (revisionId: string, index: number) => `${revisionId}:material:${index}`;
const toolSnapshotId = (revisionId: string, index: number) => `${revisionId}:tool:${index}`;

export function publishedTemplateSummary(template: Pick<DiyProjectTemplate, 'id' | 'featuredOrder'>, revision: DiyTemplateRevision) {
  return {
    id: template.id,
    slug: revision.slug,
    title: revision.title,
    shortDescription: revision.shortDescription,
    category: revision.category,
    difficultyLevel: revision.difficultyLevel,
    requiredSkillLevel: revision.requiredSkillLevel,
    safetyLevel: revision.safetyLevel,
    permitRequirement: revision.permitRequirement,
    estimatedMinutes: revision.estimatedMinutes,
    estimatedMaterialCostMinCents: revision.estimatedMaterialCostMinCents,
    estimatedMaterialCostMaxCents: revision.estimatedMaterialCostMaxCents,
    professionalCostMinCents: revision.professionalCostMinCents,
    professionalCostMaxCents: revision.professionalCostMaxCents,
    tags: revision.tags,
    featuredOrder: template.featuredOrder,
  };
}

export function revisionContent(revision: Pick<DiyTemplateRevision, 'contentJson'>): RevisionContentJson {
  return revision.contentJson as unknown as RevisionContentJson;
}

export function publishedTemplateDetail(template: Pick<DiyProjectTemplate, 'id' | 'featuredOrder'>, revision: DiyTemplateRevision) {
  const content = revisionContent(revision);
  return {
    ...publishedTemplateSummary(template, revision),
    revision: revision.revision,
    longDescription: content.longDescription,
    steps: content.steps.map((step) => ({ id: stepSnapshotId(revision.id, Number(step.stepNumber)), ...step })),
    materials: content.materials.map((material, index) => ({ id: materialSnapshotId(revision.id, index), ...material })),
    tools: content.tools.map((tool, index) => ({ id: toolSnapshotId(revision.id, index), ...tool })),
  };
}
