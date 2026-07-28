import { notFound } from 'next/navigation';
import { HomeDigitalTwinAcceptanceClient } from './homeDigitalTwinAcceptanceClient';

export default function HomeDigitalTwinAcceptancePage() {
  if (process.env.HOME_DIGITAL_TWIN_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <HomeDigitalTwinAcceptanceClient />;
}
