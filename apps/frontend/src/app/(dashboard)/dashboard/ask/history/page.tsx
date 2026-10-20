import { redirect } from 'next/navigation';
import type { AskSearchParams } from '../AskRoutePage';
import { legacyAskViewRedirect } from '../legacyViewRedirect';

// History is the conversation list beside the conversation now; this old address opens Ask with that list showing.
export default async function AskHistoryPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  redirect(legacyAskViewRedirect('history', await searchParams));
}
