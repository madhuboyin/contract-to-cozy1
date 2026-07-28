import { Suspense } from 'react';
import OwnershipCostsClient from './OwnershipCostsClient';

export default function OwnershipCostsPage() {
  return (
    <Suspense>
      <OwnershipCostsClient />
    </Suspense>
  );
}
