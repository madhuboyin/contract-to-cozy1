import { notFound } from 'next/navigation';
import { PropertyIntelligenceAcceptanceClient } from './propertyIntelligenceAcceptanceClient';

export const dynamic = 'force-dynamic';

export default function PropertyIntelligenceAcceptancePage() {
  if (process.env.PROPERTY_INTELLIGENCE_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <PropertyIntelligenceAcceptanceClient />;
}
