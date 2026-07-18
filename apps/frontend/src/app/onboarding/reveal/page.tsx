import { redirect } from 'next/navigation';

/**
 * The former reveal experience presented speculative risks and savings before
 * enough evidence existed. Keep the URL as a transition-only redirect so old
 * links rejoin the trigger-first, evidence-bounded activation flow.
 */
export default function RevealOnboardingPage() {
  redirect('/onboarding/confirm');
}
