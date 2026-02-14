// apps/frontend/src/app/(dashboard)/dashboard/components/SectionHeader.tsx

import * as React from 'react';

interface SectionHeaderProps {
  icon: string;
  title: string;
  description?: string | React.ReactNode;
  action?: React.ReactNode;
}

export function SectionHeader({ icon, title, description, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-xl">{icon}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {description && (
            <div className="text-sm text-gray-600 mt-1">{description}</div>
          )}
        </div>
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}
