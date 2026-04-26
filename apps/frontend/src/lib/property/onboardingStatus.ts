type OnboardingLike = {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  setupScore: number;
};

export function isOnboardingComplete(status: OnboardingLike | null | undefined): boolean {
  if (!status) return false;
  return status.status === 'COMPLETED' || status.setupScore === 100;
}
