import { notFound } from 'next/navigation';
import { HomeEventRadarAcceptanceClient } from './homeEventRadarAcceptanceClient';

export const dynamic = 'force-dynamic';

export default function HomeEventRadarAcceptancePage() {
  if (process.env.HOME_EVENT_RADAR_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <HomeEventRadarAcceptanceClient />;
}
