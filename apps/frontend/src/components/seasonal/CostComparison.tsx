// apps/frontend/src/components/seasonal/CostComparison.tsx
import React from 'react';
import { DollarSign, TrendingDown } from 'lucide-react';

interface CostComparisonProps {
  typicalCostMin?: number;
  typicalCostMax?: number;
  isDiyPossible: boolean;
  diyDifficulty?: 'EASY' | 'MODERATE' | 'ADVANCED';
}

export function CostComparison({ 
  typicalCostMin, 
  typicalCostMax, 
  isDiyPossible,
  diyDifficulty
}: CostComparisonProps) {
  // If no cost data, don't render
  if (!typicalCostMin && !typicalCostMax) {
    return null;
  }

  // Convert to numbers and ensure they're in dollars (not cents)
  const minCost = Number(typicalCostMin) || 0;
  const maxCost = Number(typicalCostMax) || 0;
  
  const avgProfessionalCost = minCost && maxCost 
    ? (minCost + maxCost) / 2 
    : (maxCost || minCost);

  // DIY cost is typically 20-40% of professional cost (materials only)
  const diyMaterialsPercentage = diyDifficulty === 'EASY' ? 0.2 : diyDifficulty === 'MODERATE' ? 0.3 : 0.4;
  const diyCost = isDiyPossible ? Math.round(avgProfessionalCost * diyMaterialsPercentage) : 0;
  const savings = isDiyPossible ? Math.round(avgProfessionalCost - diyCost) : 0;
  const savingsPercentage = isDiyPossible && avgProfessionalCost > 0 
    ? Math.round((savings / avgProfessionalCost) * 100) 
    : 0;

  if (!isDiyPossible) {
    // Professional only - compact display
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded border border-blue-200 text-sm">
        <DollarSign className="w-3.5 h-3.5 text-blue-600" />
        <span className="font-semibold text-blue-900">
          ${minCost.toLocaleString()}-${maxCost.toLocaleString()}
        </span>
        <span className="text-xs text-blue-600">Pro only</span>
      </div>
    );
  }

  // DIY option available - show compact comparison
  return (
    <div className="flex items-center gap-3 text-sm">
      {/* DIY Cost */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded border border-green-200">
          <DollarSign className="w-3.5 h-3.5 text-green-600" />
          <span className="font-semibold text-green-900">${diyCost}</span>
          <span className="text-xs text-green-600">DIY</span>
        </div>
      </div>

      {/* Divider */}
      <span className="text-gray-400">vs</span>

      {/* Professional Cost */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded border border-gray-200">
        <DollarSign className="w-3.5 h-3.5 text-gray-600" />
        <span className="font-semibold text-gray-900">
          ${minCost.toLocaleString()}-${maxCost.toLocaleString()}
        </span>
        <span className="text-xs text-gray-600">Pro</span>
      </div>

      {/* Savings Indicator */}
      {savings > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded border border-green-300">
          <TrendingDown className="w-3.5 h-3.5 text-green-700" />
          <span className="text-xs font-semibold text-green-900">
            Save ${savings.toLocaleString()} ({savingsPercentage}%)
          </span>
        </div>
      )}
    </div>
  );
}