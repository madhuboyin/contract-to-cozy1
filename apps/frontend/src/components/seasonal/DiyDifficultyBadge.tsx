// apps/frontend/src/components/seasonal/DiyDifficultyBadge.tsx
import React from 'react';
import { Star, Wrench, AlertTriangle } from 'lucide-react';

type DiyDifficulty = 'EASY' | 'MODERATE' | 'ADVANCED';

interface DiyDifficultyBadgeProps {
  difficulty: DiyDifficulty;
  estimatedHours?: number;
  className?: string;
}

const difficultyConfig = {
  EASY: {
    label: 'Easy',
    stars: 1,
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: Wrench,
    description: '1-2 hours, basic tools',
  },
  MODERATE: {
    label: 'Moderate',
    stars: 2,
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    icon: Wrench,
    description: '2-4 hours, some experience',
  },
  ADVANCED: {
    label: 'Advanced',
    stars: 3,
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: AlertTriangle,
    description: '4+ hours, specialized tools',
  },
};

export function DiyDifficultyBadge({ 
  difficulty, 
  estimatedHours,
  className = '' 
}: DiyDifficultyBadgeProps) {
  const config = difficultyConfig[difficulty];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${config.color} ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-semibold">{config.label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Star
            key={i}
            className={`w-2.5 h-2.5 ${
              i < config.stars 
                ? 'fill-current' 
                : 'fill-gray-200 text-gray-200'
            }`}
          />
        ))}
      </div>
      {estimatedHours && (
        <span className="text-xs opacity-75">~{estimatedHours}h</span>
      )}
    </div>
  );
}

// Professional Service Badge (for non-DIY tasks)
export function ProfessionalServiceBadge({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs ${className}`}>
      <AlertTriangle className="w-3.5 h-3.5 text-blue-600" />
      <span className="font-semibold text-blue-900">Pro Required</span>
    </div>
  );
}