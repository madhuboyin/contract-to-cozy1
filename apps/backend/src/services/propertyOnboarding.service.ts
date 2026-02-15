import { OnboardingStatus, Prisma, PropertyOnboarding } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type SetupStatusDTO = {
  propertyId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  currentStep: SetupStep;
  dismissedAt: string | null;
  setupScore: number;
  steps: Array<{
    step: SetupStep;
    title: string;
    description: string;
    complete: boolean;
    ctaLabel: string;
    href: string;
  }>;
  recommendedNextStep: SetupStep;
};

type CompletionMap = Record<string, boolean>;

const STEP_TEMPLATES: Array<{
  step: SetupStep;
  title: string;
  description: string;
  ctaLabel: string;
  href: (propertyId: string) => string;
}> = [
  {
    step: 1,
    title: 'Add Property Details',
    description: 'Add baseline details so your home profile is accurate.',
    ctaLabel: 'Edit details',
    href: (propertyId) => `/dashboard/properties/${propertyId}/edit`,
  },
  {
    step: 2,
    title: 'Create Rooms',
    description: 'Set up rooms to organize inventory and room-level insights.',
    ctaLabel: 'Manage rooms',
    href: (propertyId) => `/dashboard/properties/${propertyId}/rooms`,
  },
  {
    step: 3,
    title: 'Add Inventory',
    description: 'Track key items and systems to unlock better coverage insights.',
    ctaLabel: 'Open inventory',
    href: (propertyId) => `/dashboard/properties/${propertyId}/inventory`,
  },
  {
    step: 4,
    title: 'Activate Protection',
    description: 'Enable proactive protection by configuring tasks or alerts.',
    ctaLabel: 'Open incidents',
    href: (propertyId) => `/dashboard/properties/${propertyId}/incidents`,
  },
  {
    step: 5,
    title: 'Generate Insights',
    description: 'Generate or review reports to unlock a complete home snapshot.',
    ctaLabel: 'View insights',
    href: (propertyId) => `/dashboard/properties/${propertyId}/risk-assessment`,
  },
];

function toCompletionMap(value: Prisma.JsonValue | null | undefined): CompletionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const map: CompletionMap = {};
  for (const [key, raw] of Object.entries(value as Prisma.JsonObject)) {
    map[key] = Boolean(raw);
  }
  return map;
}

function isSetupStep(value: number): value is SetupStep {
  return value >= 1 && value <= 5;
}

function normalizeStep(value: number): SetupStep {
  if (isSetupStep(value)) return value;
  if (value < 1) return 1;
  return 5;
}

function allStepsCompletedMap(): CompletionMap {
  return { '1': true, '2': true, '3': true, '4': true, '5': true };
}

async function assertPropertyAccess(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      climateSetting: {
        select: {
          notificationEnabled: true,
        },
      },
      _count: {
        select: {
          inventoryRooms: true,
          inventoryItems: true,
          maintenanceTasks: true,
          homeReportExports: true,
        },
      },
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

export async function getOrCreateOnboarding(
  propertyId: string,
  userId: string
): Promise<PropertyOnboarding> {
  const existing = await prisma.propertyOnboarding.findUnique({
    where: { propertyId },
  });

  if (existing) {
    return existing;
  }

  return prisma.propertyOnboarding.create({
    data: {
      propertyId,
      userId,
      status: OnboardingStatus.IN_PROGRESS,
      currentStep: 1,
      completedJson: {},
      setupScore: 0,
    },
  });
}

export async function computeSetupStatus(
  propertyId: string,
  userId: string
): Promise<SetupStatusDTO> {
  const property = await assertPropertyAccess(propertyId, userId);
  const onboarding = await getOrCreateOnboarding(propertyId, userId);
  const completedJson = toCompletionMap(onboarding.completedJson);

  const stepCompletionByData: Record<SetupStep, boolean> = {
    1:
      Boolean(property.name && property.name.trim().length > 0) ||
      Boolean(
        property.address &&
          property.city &&
          property.state &&
          property.zipCode &&
          property.state.trim().length > 0 &&
          property.zipCode.trim().length > 0
      ),
    2: property._count.inventoryRooms > 0,
    3: property._count.inventoryItems > 0,
    4:
      Boolean(property.climateSetting?.notificationEnabled) ||
      property._count.maintenanceTasks > 0,
    5: property._count.homeReportExports > 0,
  };

  const steps = STEP_TEMPLATES.map((template) => {
    const complete =
      stepCompletionByData[template.step] || Boolean(completedJson[String(template.step)]);

    return {
      step: template.step,
      title: template.title,
      description: template.description,
      complete,
      ctaLabel: template.ctaLabel,
      href: template.href(propertyId),
    };
  });

  const completedCount = steps.filter((step) => step.complete).length;
  const setupScore = completedCount * 20;
  const recommendedNextStep =
    (steps.find((step) => !step.complete)?.step ?? 5) as SetupStep;

  const allComplete = completedCount === 5;

  let nextStatus = onboarding.status;
  if (allComplete) {
    nextStatus = OnboardingStatus.COMPLETED;
  } else if (nextStatus === OnboardingStatus.COMPLETED) {
    nextStatus = OnboardingStatus.IN_PROGRESS;
  }

  const nextCurrentStep = allComplete
    ? 5
    : normalizeStep(onboarding.currentStep || recommendedNextStep);

  if (
    nextStatus !== onboarding.status ||
    nextCurrentStep !== onboarding.currentStep ||
    setupScore !== onboarding.setupScore
  ) {
    await prisma.propertyOnboarding.update({
      where: { propertyId },
      data: {
        status: nextStatus,
        currentStep: nextCurrentStep,
        setupScore,
      },
    });
  }

  return {
    propertyId,
    status: nextStatus,
    currentStep: nextCurrentStep,
    dismissedAt: onboarding.dismissedAt ? onboarding.dismissedAt.toISOString() : null,
    setupScore,
    steps,
    recommendedNextStep,
  };
}

export async function setCurrentStep(
  propertyId: string,
  userId: string,
  currentStep: number
): Promise<SetupStatusDTO> {
  await assertPropertyAccess(propertyId, userId);
  await getOrCreateOnboarding(propertyId, userId);

  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      currentStep: normalizeStep(currentStep),
      status: OnboardingStatus.IN_PROGRESS,
      dismissedAt: null,
    },
  });

  return computeSetupStatus(propertyId, userId);
}

export async function completeStep(
  propertyId: string,
  userId: string,
  step: number
): Promise<SetupStatusDTO> {
  const normalized = normalizeStep(step);
  await assertPropertyAccess(propertyId, userId);
  const onboarding = await getOrCreateOnboarding(propertyId, userId);
  const completedJson = toCompletionMap(onboarding.completedJson);

  completedJson[String(normalized)] = true;

  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      completedJson,
      currentStep: normalizeStep(normalized + 1),
      status: OnboardingStatus.IN_PROGRESS,
      dismissedAt: null,
    },
  });

  return computeSetupStatus(propertyId, userId);
}

export async function skipOnboarding(
  propertyId: string,
  userId: string
): Promise<SetupStatusDTO> {
  await assertPropertyAccess(propertyId, userId);
  await getOrCreateOnboarding(propertyId, userId);

  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      status: OnboardingStatus.SKIPPED,
      dismissedAt: new Date(),
    },
  });

  return computeSetupStatus(propertyId, userId);
}

export async function finishOnboarding(
  propertyId: string,
  userId: string
): Promise<SetupStatusDTO> {
  await assertPropertyAccess(propertyId, userId);
  await getOrCreateOnboarding(propertyId, userId);

  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      status: OnboardingStatus.COMPLETED,
      currentStep: 5,
      completedJson: allStepsCompletedMap(),
      setupScore: 100,
      dismissedAt: null,
    },
  });

  return computeSetupStatus(propertyId, userId);
}
