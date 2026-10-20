import { redirect } from 'next/navigation';
import type { AskSearchParams } from '../AskRoutePage';
import { legacyAskViewRedirect } from '../legacyViewRedirect';

// Saved is a block in the conversation now; this old address opens Ask with it already shown.
export default async function AskSavedPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  redirect(legacyAskViewRedirect('saved', await searchParams));
}
