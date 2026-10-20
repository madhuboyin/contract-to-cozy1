import { redirect } from 'next/navigation';
import type { AskSearchParams } from '../AskRoutePage';
import { legacyAskViewRedirect } from '../legacyViewRedirect';

// Work is a block in the conversation now; this old address opens Ask with it already shown.
export default async function AskWorkPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  redirect(legacyAskViewRedirect('work', await searchParams));
}
