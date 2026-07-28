import { notFound } from 'next/navigation';
import { PropertyTaxAcceptanceClient } from './propertyTaxAcceptanceClient';

export const dynamic = 'force-dynamic';

export default function PropertyTaxAcceptancePage() {
  if (process.env.PROPERTY_TAX_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <PropertyTaxAcceptanceClient />;
}
