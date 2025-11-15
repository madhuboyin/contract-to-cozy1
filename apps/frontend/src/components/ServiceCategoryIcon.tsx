// apps/frontend/src/components/ServiceCategoryIcon.tsx
import React from 'react';
import {
  Clipboard,
  Truck,
  Sparkles,
  Key,
  Bug,
  Wind,
  Wrench,
  Droplet,
  Zap,
  Leaf,
  Home,
} from 'lucide-react';

interface ServiceCategoryIconProps {
  icon: string;
  className?: string;
}

/**
 * Maps icon string identifiers from the database to Lucide React icons
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'clipboard-check': Clipboard,
  'truck': Truck,
  'sparkles': Sparkles,
  'key': Key,
  'bug': Bug,
  'wind': Wind,
  'wrench': Wrench,
  'droplet': Droplet,
  'zap': Zap,
  'leaf': Leaf,
  'home': Home,
};

export function ServiceCategoryIcon({ icon, className = "h-5 w-5" }: ServiceCategoryIconProps) {
  const IconComponent = ICON_MAP[icon] || Wrench; // Default to Wrench if not found
  return <IconComponent className={className} />;
}

export function getServiceCategoryIcon(icon: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[icon] || Wrench;
}