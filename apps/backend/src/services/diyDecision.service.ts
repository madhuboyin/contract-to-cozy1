// apps/backend/src/services/diyDecision.service.ts
import { DiySkillLevel, DiyDifficultyLevel, DiySafetyLevel, DiyDecisionVerdict, DiyProjectCategory, PermitRequirementStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface DiyDecisionInput {
  projectCategory: DiyProjectCategory;
  difficultyLevel: DiyDifficultyLevel;
  safetyLevel: DiySafetyLevel;
  permitRequirement: PermitRequirementStatus;
  requiredSkillLevel: DiySkillLevel;
  estimatedMinutes: number;
  requiredToolCanonicalIds: string[];
  userId: string;
  estimatedMaterialCostMinCents?: number;
  estimatedMaterialCostMaxCents?: number;
  professionalCostMinCents?: number;
  professionalCostMaxCents?: number;
}

export interface DiyDecisionFactor {
  code: string;
  label: string;
  effect: 'positive' | 'negative' | 'neutral';
  contributionPoints: number;
  description: string;
}

export interface DiyDecisionResult {
  verdict: DiyDecisionVerdict;
  score: number;
  factors: DiyDecisionFactor[];
  blockers: string[];
  savingsEstimateCents: number;
  reasoning: string;
}

const SKILL_RANK: Record<DiySkillLevel, number> = {
  BEGINNER: 0,
  INTERMEDIATE: 1,
  ADVANCED: 2,
};

const DIFFICULTY_RANK: Record<DiyDifficultyLevel, number> = {
  EASY: 0,
  MODERATE: 1,
  HARD: 2,
  EXPERT_ONLY: 3,
};

function verdictFromScore(score: number): DiyDecisionVerdict {
  if (score >= 70) return 'DIY_RECOMMENDED';
  if (score >= 40) return 'BORDERLINE';
  if (score >= 20) return 'HIRE_RECOMMENDED';
  return 'HIRE_REQUIRED';
}

export class DiyDecisionService {
  async score(input: DiyDecisionInput): Promise<DiyDecisionResult> {
    const {
      projectCategory,
      difficultyLevel,
      safetyLevel,
      permitRequirement,
      requiredSkillLevel,
      estimatedMinutes,
      requiredToolCanonicalIds,
      userId,
      estimatedMaterialCostMinCents,
      estimatedMaterialCostMaxCents,
      professionalCostMinCents,
      professionalCostMaxCents,
    } = input;

    // Fetch user's skill profile
    const skillProfile = await prisma.diySkillProfile.findUnique({ where: { userId } });

    const categoryKey = projectCategory.toLowerCase() as keyof typeof skillProfile;
    const userSkillLevel: DiySkillLevel =
      skillProfile && typeof skillProfile[categoryKey] === 'string'
        ? (skillProfile[categoryKey] as DiySkillLevel)
        : 'BEGINNER';

    const blockers: string[] = [];
    const factors: DiyDecisionFactor[] = [];

    // ── Hard overrides ─────────────────────────────────────────────────────────
    if (safetyLevel === 'HIGH' && userSkillLevel === 'BEGINNER') {
      blockers.push('This project has high safety risk and requires more than beginner experience.');
    }
    if (permitRequirement === 'REQUIRED' && safetyLevel === 'HIGH') {
      blockers.push('A permit is required for this project and safety risk is high — hire a licensed contractor.');
    }
    if (projectCategory === 'ELECTRICAL' && safetyLevel === 'HIGH' && userSkillLevel !== 'ADVANCED') {
      blockers.push('High-risk electrical work requires an advanced skill level or a licensed electrician.');
    }

    if (blockers.length > 0) {
      return {
        verdict: 'HIRE_REQUIRED',
        score: 0,
        factors,
        blockers,
        savingsEstimateCents: 0,
        reasoning: blockers[0],
      };
    }

    // ── Skill match (40 pts) ───────────────────────────────────────────────────
    const userRank = SKILL_RANK[userSkillLevel];
    const requiredRank = SKILL_RANK[requiredSkillLevel];
    const skillDiff = userRank - requiredRank;
    let skillPoints = 0;
    if (skillDiff >= 1) {
      skillPoints = 40;
    } else if (skillDiff === 0) {
      skillPoints = 30;
    } else if (skillDiff === -1) {
      skillPoints = 15;
    } else {
      skillPoints = 0;
    }
    factors.push({
      code: 'SKILL_MATCH',
      label: 'Skill Match',
      effect: skillPoints >= 30 ? 'positive' : skillPoints >= 15 ? 'neutral' : 'negative',
      contributionPoints: skillPoints,
      description: `Your ${projectCategory.toLowerCase()} skill level is ${userSkillLevel.toLowerCase()}; this project requires ${requiredSkillLevel.toLowerCase()}.`,
    });

    // ── Safety risk (25 pts) ───────────────────────────────────────────────────
    let safetyPoints = 0;
    if (safetyLevel === 'LOW') safetyPoints = 25;
    else if (safetyLevel === 'MODERATE') safetyPoints = 15;
    else safetyPoints = 5;
    factors.push({
      code: 'SAFETY_RISK',
      label: 'Safety Risk',
      effect: safetyLevel === 'LOW' ? 'positive' : safetyLevel === 'MODERATE' ? 'neutral' : 'negative',
      contributionPoints: safetyPoints,
      description: `Safety level is ${safetyLevel.toLowerCase()}${safetyLevel === 'HIGH' ? ' — proper PPE and precautions are essential' : ''}.`,
    });

    // ── Tool availability (15 pts) ─────────────────────────────────────────────
    const ownedTools: string[] = Array.isArray(skillProfile?.toolsOwnedJson) ? skillProfile.toolsOwnedJson as string[] : [];
    let toolPoints = 15;
    if (requiredToolCanonicalIds.length > 0) {
      const ownedCount = requiredToolCanonicalIds.filter((t) => ownedTools.includes(t)).length;
      const ratio = ownedCount / requiredToolCanonicalIds.length;
      toolPoints = Math.round(ratio * 15);
    }
    factors.push({
      code: 'TOOL_AVAILABILITY',
      label: 'Tool Availability',
      effect: toolPoints >= 12 ? 'positive' : toolPoints >= 6 ? 'neutral' : 'negative',
      contributionPoints: toolPoints,
      description: requiredToolCanonicalIds.length === 0
        ? 'No specialty tools required.'
        : `You own ${ownedTools.filter((t) => requiredToolCanonicalIds.includes(t)).length} of ${requiredToolCanonicalIds.length} required tools.`,
    });

    // ── Time feasibility (10 pts) ──────────────────────────────────────────────
    let timePoints = 10;
    if (estimatedMinutes > 960) timePoints = 0;
    else if (estimatedMinutes > 480) timePoints = 4;
    else if (estimatedMinutes > 240) timePoints = 7;
    factors.push({
      code: 'TIME_FEASIBILITY',
      label: 'Time to Complete',
      effect: timePoints >= 7 ? 'positive' : timePoints >= 4 ? 'neutral' : 'negative',
      contributionPoints: timePoints,
      description: `Estimated time: ${Math.round(estimatedMinutes / 60 * 10) / 10} hours.`,
    });

    // ── Permit requirement (10 pts) ────────────────────────────────────────────
    let permitPoints = 10;
    if (permitRequirement === 'REQUIRED') permitPoints = 0;
    else if (permitRequirement === 'LIKELY_REQUIRED') permitPoints = 3;
    else if (permitRequirement === 'UNKNOWN') permitPoints = 7;
    factors.push({
      code: 'PERMIT_REQUIREMENT',
      label: 'Permit Requirement',
      effect: permitPoints >= 7 ? 'positive' : permitPoints >= 3 ? 'neutral' : 'negative',
      contributionPoints: permitPoints,
      description: `Permit status: ${permitRequirement.replace(/_/g, ' ').toLowerCase()}.`,
    });

    const score = skillPoints + safetyPoints + toolPoints + timePoints + permitPoints;
    const verdict = verdictFromScore(score);

    // ── Savings estimate ───────────────────────────────────────────────────────
    const proMid =
      professionalCostMinCents !== undefined && professionalCostMaxCents !== undefined
        ? Math.round((professionalCostMinCents + professionalCostMaxCents) / 2)
        : 0;
    const materialMid =
      estimatedMaterialCostMinCents !== undefined && estimatedMaterialCostMaxCents !== undefined
        ? Math.round((estimatedMaterialCostMinCents + estimatedMaterialCostMaxCents) / 2)
        : 0;
    const savingsEstimateCents = Math.max(0, proMid - materialMid);

    const reasoningMap: Record<DiyDecisionVerdict, string> = {
      DIY_RECOMMENDED: `Your skill level and tool availability make this a solid DIY project — you could save ~$${Math.round(savingsEstimateCents / 100)}.`,
      BORDERLINE: 'This project is doable but take your time and follow each step carefully.',
      HIRE_RECOMMENDED: 'The risk of mistakes on this project likely outweighs the savings from DIY.',
      HIRE_REQUIRED: 'This project requires professional expertise — hire a licensed contractor.',
    };

    return {
      verdict,
      score,
      factors,
      blockers,
      savingsEstimateCents,
      reasoning: reasoningMap[verdict],
    };
  }
}

export const diyDecisionService = new DiyDecisionService();
