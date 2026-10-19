import { Suspense, type ReactNode } from 'react';
import { AskDestinationNav } from '@/components/ask/workspace/AskDestinationNav';

export default function AskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#faf9f6]">
      <div className="order-1 hidden md:block"><Suspense fallback={null}><AskDestinationNav /></Suspense></div>
      <div className="order-2 min-h-0 flex-1">{children}</div>
      <div className="order-3 md:hidden"><Suspense fallback={null}><AskDestinationNav /></Suspense></div>
    </div>
  );
}
