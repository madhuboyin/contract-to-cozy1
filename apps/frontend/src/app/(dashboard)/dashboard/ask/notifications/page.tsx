import { redirect } from 'next/navigation';
import type { AskSearchParams } from '../AskRoutePage';
import { legacyAskViewRedirect } from '../legacyViewRedirect';

// Notifications and their settings are answers in the conversation now; this old address opens Ask with the question already asked.
export default async function AskNotificationsPage({ searchParams }: { searchParams: Promise<AskSearchParams & { tab?: string }> }) {
  redirect(legacyAskViewRedirect('notifications', await searchParams));
}
