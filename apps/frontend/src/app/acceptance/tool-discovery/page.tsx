import { notFound } from 'next/navigation';
import { ToolDiscoveryAcceptanceClient } from './toolDiscoveryAcceptanceClient';

export default function ToolDiscoveryAcceptancePage() {
  if (process.env.TOOL_DISCOVERY_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <ToolDiscoveryAcceptanceClient />;
}
