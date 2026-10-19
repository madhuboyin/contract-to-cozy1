import { AskRoutePage, type AskSearchParams } from '../AskRoutePage';

export default function AskHistoryPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  return <AskRoutePage searchParams={searchParams} initialHistoryOpen />;
}
