import { notFound } from 'next/navigation';
import { PropertyContextAcceptanceClient } from './propertyContextAcceptanceClient';

export const dynamic = 'force-dynamic';

type Scenario = 'scalar' | 'structured' | 'relational';

export default async function PropertyContextAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.PROPERTY_CONTEXT_ACCEPTANCE_FIXTURE !== '1') notFound();

  const requestedScenario = (await searchParams).scenario;
  const scenario: Scenario = requestedScenario === 'structured' || requestedScenario === 'relational'
    ? requestedScenario
    : 'scalar';

  return <PropertyContextAcceptanceClient scenario={scenario} />;
}
