// apps/frontend/src/utils/seasonHelpers.ts
import { Season, ClimateRegion, TaskPriority } from '@/types/seasonal.types';

export const seasonConfig = {
  SPRING: {
    name: 'Spring',
    icon: '🌸',
    color: 'green',
    gradient: 'from-green-400 to-emerald-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  SUMMER: {
    name: 'Summer',
    icon: '☀️',
    color: 'yellow',
    gradient: 'from-yellow-400 to-orange-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
  },
  FALL: {
    name: 'Fall',
    icon: '🍂',
    color: 'orange',
    gradient: 'from-orange-400 to-red-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  WINTER: {
    name: 'Winter',
    icon: '❄️',
    color: 'blue',
    gradient: 'from-blue-400 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
};

export const climateRegionConfig = {
  VERY_COLD: {
    name: 'Very Cold',
    description: 'Zones 1-4',
    icon: '🥶',
  },
  COLD: {
    name: 'Cold',
    description: 'Zones 5-6',
    icon: '❄️',
  },
  MODERATE: {
    name: 'Moderate',
    description: 'Zones 7-8',
    icon: '🌤️',
  },
  WARM: {
    name: 'Warm',
    description: 'Zones 9-10',
    icon: '☀️',
  },
  TROPICAL: {
    name: 'Tropical',
    description: 'Zones 11-13',
    icon: '🌴',
  },
};

export const priorityConfig = {
  CRITICAL: {
    name: 'Critical',
    color: 'red',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    badge: 'bg-red-100 text-red-800',
    icon: '🔴',
  },
  RECOMMENDED: {
    name: 'Recommended',
    color: 'orange',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-800',
    icon: '🟡',
  },
  OPTIONAL: {
    name: 'Optional',
    color: 'green',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    badge: 'bg-green-100 text-green-800',
    icon: '🟢',
  },
};

export function getSeasonIcon(season: Season): string {
  return seasonConfig[season]?.icon || '📅';
}

export function getSeasonName(season: Season): string {
  return seasonConfig[season]?.name || season;
}

export function getSeasonColors(season: Season) {
  return seasonConfig[season] || seasonConfig.SPRING;
}

export function getClimateRegionName(region: ClimateRegion): string {
  return climateRegionConfig[region]?.name || region;
}

export function getClimateRegionIcon(region: ClimateRegion): string {
  return climateRegionConfig[region]?.icon || '🌡️';
}

export function getPriorityBadgeClass(priority: TaskPriority): string {
  return priorityConfig[priority]?.badge || 'bg-gray-100 text-gray-800';
}

export function getPriorityIcon(priority: TaskPriority): string {
  return priorityConfig[priority]?.icon || '⚪';
}

export function formatCostRange(min?: number, max?: number): string {
  if (!min && !max) return 'Cost varies';
  if (min === 0 && max === 0) return 'DIY (Free)';
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  if (min) return `From $${min.toLocaleString()}`;
  if (max) return `Up to $${max.toLocaleString()}`;
  return 'Cost varies';
}

export function formatDaysRemaining(days: number): string {
  if (days < 0) return 'Season ended';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 14) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`;
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 60) return `About ${Math.floor(days / 30)} month`;
  return `${Math.floor(days / 30)} months`;
}

export function getCompletionPercentage(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function getProgressBarColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}