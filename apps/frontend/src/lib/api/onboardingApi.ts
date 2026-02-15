import { api } from '@/lib/api/client';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export type OnboardingStatusDTO = {
  propertyId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  currentStep: OnboardingStep;
  dismissedAt: string | null;
  setupScore: number;
  steps: Array<{
    step: OnboardingStep;
    title: string;
    description: string;
    complete: boolean;
    ctaLabel: string;
    href: string;
  }>;
  recommendedNextStep: OnboardingStep;
};

export async function getOnboardingStatus(propertyId: string): Promise<OnboardingStatusDTO> {
  const response = await api.get<OnboardingStatusDTO>(
    `/api/properties/${propertyId}/onboarding/status`
  );
  return response.data;
}

export async function setOnboardingStep(
  propertyId: string,
  currentStep: OnboardingStep
): Promise<OnboardingStatusDTO> {
  const response = await api.post<OnboardingStatusDTO>(
    `/api/properties/${propertyId}/onboarding/set-step`,
    { currentStep }
  );
  return response.data;
}

export async function completeOnboardingStep(
  propertyId: string,
  step: OnboardingStep
): Promise<OnboardingStatusDTO> {
  const response = await api.post<OnboardingStatusDTO>(
    `/api/properties/${propertyId}/onboarding/complete-step`,
    { step }
  );
  return response.data;
}

export async function skipOnboarding(propertyId: string): Promise<OnboardingStatusDTO> {
  const response = await api.post<OnboardingStatusDTO>(
    `/api/properties/${propertyId}/onboarding/skip`
  );
  return response.data;
}

export async function finishOnboarding(propertyId: string): Promise<OnboardingStatusDTO> {
  const response = await api.post<OnboardingStatusDTO>(
    `/api/properties/${propertyId}/onboarding/finish`
  );
  return response.data;
}
