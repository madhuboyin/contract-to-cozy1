// apps/backend/src/validators/diy.validators.ts
import { z } from 'zod';

const skillLevel = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const category = z.enum(['HVAC', 'PLUMBING', 'ELECTRICAL', 'PAINTING', 'GENERAL', 'EXTERIOR', 'FLOORING', 'APPLIANCE', 'LANDSCAPING', 'OTHER']);
const difficulty = z.enum(['EASY', 'MODERATE', 'HARD', 'EXPERT_ONLY']);

export const UpsertSkillProfileSchema = z.object({
  hvac: skillLevel,
  plumbing: skillLevel,
  electrical: skillLevel,
  painting: skillLevel,
  general: skillLevel,
  exterior: skillLevel,
  flooring: skillLevel,
  appliance: skillLevel,
  landscaping: skillLevel,
  toolsOwnedJson: z.array(z.string()).optional(),
  quizAnswersJson: z.any().optional(),
  assessedAt: z.string().datetime().optional(),
});

export const ListTemplatesSchema = z.object({
  category: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.union([z.string(), z.array(z.string())]).optional(),
  maxSkillLevel: skillLevel.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const DiyDecisionSchema = z.object({
  projectCategory: category,
  difficultyLevel: difficulty,
  safetyLevel: z.enum(['LOW', 'MODERATE', 'HIGH']),
  permitRequirement: z.enum(['REQUIRED', 'NOT_REQUIRED', 'LIKELY_REQUIRED', 'LIKELY_NOT_REQUIRED', 'UNKNOWN', 'DATA_UNAVAILABLE']),
  requiredSkillLevel: skillLevel,
  estimatedMinutes: z.number().int().min(1),
  requiredToolCanonicalIds: z.array(z.string()).default([]),
  estimatedMaterialCostMinCents: z.number().int().optional(),
  estimatedMaterialCostMaxCents: z.number().int().optional(),
  professionalCostMinCents: z.number().int().optional(),
  professionalCostMaxCents: z.number().int().optional(),
});

export const CreateProjectSchema = z.object({
  templateId: z.string().optional(),
  aiGuideId: z.string().optional(),
  maintenanceTaskId: z.string().optional(),
  incidentId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  decisionVerdict: z.enum(['DIY_RECOMMENDED', 'BORDERLINE', 'HIRE_RECOMMENDED', 'HIRE_REQUIRED']).optional(),
  decisionScoreJson: z.any().optional(),
}).refine((d) => d.templateId || d.aiGuideId, {
  message: 'Either templateId or aiGuideId must be provided',
});

export const UpdateProjectSchema = z.object({
  notesJson: z.array(z.object({ text: z.string(), createdAt: z.string() })).optional(),
  photoUrls: z.array(z.string().url()).optional(),
});

export const UpdateStepSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
  notes: z.string().optional(),
});

export const CompleteProjectSchema = z.object({
  actualMinutes: z.number().int().min(1).optional(),
  actualMaterialCostCents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const AbandonProjectSchema = z.object({
  hireOut: z.boolean().default(false),
});

export const GenerateAiGuideSchema = z.object({
  userPrompt: z.string().min(10).max(1000),
});

export const ListProjectsSchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  category: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const templateStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedMinutes: z.number().int().optional(),
  safetyNote: z.string().optional(),
  tipNote: z.string().optional(),
  imageUrl: z.string().url().optional(),
  isOptional: z.boolean().default(false),
});

const templateMaterialSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().min(1),
  quantityFormula: z.string().min(1),
  unitPriceCents: z.number().int().min(0),
  isOptional: z.boolean().default(false),
  purchaseNote: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const templateToolSchema = z.object({
  name: z.string().min(1),
  canonicalId: z.string().optional(),
  description: z.string().optional(),
  isRequired: z.boolean().default(true),
  defaultToolAction: z.enum(['ALREADY_OWNED', 'RENT', 'BUY']).default('ALREADY_OWNED'),
  rentDailyPriceCents: z.number().int().optional(),
  buyEstimatePriceCents: z.number().int().optional(),
  sortOrder: z.number().int().default(0),
});

export const AdminCreateTemplateSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  longDescription: z.string().optional(),
  category,
  difficultyLevel: difficulty,
  requiredSkillLevel: skillLevel,
  safetyLevel: z.enum(['LOW', 'MODERATE', 'HIGH']),
  permitRequirement: z.enum(['REQUIRED', 'NOT_REQUIRED', 'LIKELY_REQUIRED', 'LIKELY_NOT_REQUIRED', 'UNKNOWN', 'DATA_UNAVAILABLE']),
  estimatedMinutes: z.number().int().min(1),
  estimatedMaterialCostMinCents: z.number().int().optional(),
  estimatedMaterialCostMaxCents: z.number().int().optional(),
  professionalCostMinCents: z.number().int().optional(),
  professionalCostMaxCents: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
  featuredOrder: z.number().int().optional(),
  geminiPromptHint: z.string().optional(),
  steps: z.array(templateStepSchema).default([]),
  materials: z.array(templateMaterialSchema).default([]),
  tools: z.array(templateToolSchema).default([]),
});

export const AdminUpdateTemplateSchema = AdminCreateTemplateSchema.partial().omit({ slug: true });
