import { notFound } from 'next/navigation';
import { HomeBuyerLifecycleAcceptanceClient } from './homeBuyerLifecycleAcceptanceClient';

export default function HomeBuyerLifecycleAcceptancePage() {
  if (process.env.HOME_BUYER_LIFECYCLE_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <HomeBuyerLifecycleAcceptanceClient />;
}
