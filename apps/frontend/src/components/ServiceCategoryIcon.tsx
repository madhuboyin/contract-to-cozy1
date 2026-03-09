// apps/frontend/src/components/ServiceCategoryIcon.tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Wrench } from 'lucide-react';
import { resolveServiceCategoryIcon } from '@/lib/icons';

interface ServiceCategoryIconProps {
  icon: string;
  className?: string;
}

export function ServiceCategoryIcon({ icon, className = "h-5 w-5" }: ServiceCategoryIconProps) {
  const IconComponent = resolveServiceCategoryIcon(icon, Wrench);
  return <IconComponent className={className} />;
}

export function getServiceCategoryIcon(icon: string): LucideIcon {
  return resolveServiceCategoryIcon(icon, Wrench);
}
