import { AskRoutePage, type AskSearchParams } from './AskRoutePage';

export default function AskPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  return <AskRoutePage searchParams={searchParams} />;
}
