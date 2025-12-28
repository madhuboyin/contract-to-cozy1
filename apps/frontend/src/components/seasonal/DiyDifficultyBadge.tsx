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
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${config.color} ${className}`}>
      <Icon className="w-4 h-4" />
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold">{config.label} DIY</span>
          <div className="flex gap-0.5 ml-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${
                  i < config.stars 
                    ? 'fill-current' 
                    : 'fill-gray-200 text-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
        <span className="text-xs opacity-75">
          {estimatedHours ? `~${estimatedHours} hrs` : config.description}
        </span>
      </div>
    </div>
  );
}

// Professional Service Badge (for non-DIY tasks)
export function ProfessionalServiceBadge({ className = '' }: { className?: string }) {
  return (
    <div className={`p-3 bg-blue-50 border border-blue-200 rounded-lg ${className}`}>
      <p className="text-sm text-blue-800 font-medium flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Professional Service Recommended
      </p>
      <p className="text-xs text-blue-600 mt-1">
        This task requires specialized expertise or licensing
      </p>
    </div>
  );
}