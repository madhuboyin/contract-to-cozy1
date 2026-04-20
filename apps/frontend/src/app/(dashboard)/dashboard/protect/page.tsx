import { Suspense } from 'react';
import RiskProtectionClient from './RiskProtectionClient';

export default function ProtectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Monitoring your home&apos;s safety...</p>
        </div>
      }
    >
      <RiskProtectionClient />
    </Suspense>
  );
}
