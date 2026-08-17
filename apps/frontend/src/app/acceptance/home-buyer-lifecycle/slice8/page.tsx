import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Slice8AcceptanceClient } from './slice8AcceptanceClient';

export const metadata: Metadata = {
  title: 'Home buyer Slice 8 acceptance | ContractToCozy',
};

export default function Slice8AcceptancePage() {
  if (process.env.HOME_BUYER_LIFECYCLE_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <Slice8AcceptanceClient />;
}
