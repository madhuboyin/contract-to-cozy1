import { notFound } from 'next/navigation';
import { CoverageLaunchAcceptanceClient } from './coverageLaunchAcceptanceClient';

export const dynamic = 'force-dynamic';

export default function CoverageLaunchAcceptancePage() {
  if (process.env.COVERAGE_LAUNCH_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <CoverageLaunchAcceptanceClient />;
}
