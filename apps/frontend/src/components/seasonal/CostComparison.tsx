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

  const professionalCost = typicalCostMax || typicalCostMin || 0;
  const avgProfessionalCost = typicalCostMin && typicalCostMax 
    ? (typicalCostMin + typicalCostMax) / 2 
    : professionalCost;

  // DIY cost is typically 20-40% of professional cost (materials only)
  const diyMaterialsPercentage = diyDifficulty === 'EASY' ? 0.2 : diyDifficulty === 'MODERATE' ? 0.3 : 0.4;
  const diyCost = isDiyPossible ? Math.round(avgProfessionalCost * diyMaterialsPercentage) : 0;
  const savings = isDiyPossible ? Math.round(avgProfessionalCost - diyCost) : 0;
  const savingsPercentage = isDiyPossible ? Math.round((savings / avgProfessionalCost) * 100) : 0;

  if (!isDiyPossible) {
    // Professional only - just show cost
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-blue-900">Professional Service</span>
        </div>
        <p className="text-2xl font-bold text-blue-900">
          ${typicalCostMin?.toLocaleString()} - ${typicalCostMax?.toLocaleString()}
        </p>
        <p className="text-xs text-blue-600 mt-1">Typical cost range</p>
      </div>
    );
  }

  // DIY option available - show comparison
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* DIY Cost */}
      <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold text-green-900">DIY Cost</span>
        </div>
        <p className="text-2xl font-bold text-green-900">${diyCost}</p>
        <p className="text-xs text-green-600 mt-1">Materials only</p>
      </div>

      {/* Professional Cost */}
      <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-900">Professional</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          ${typicalCostMin?.toLocaleString()}-${typicalCostMax?.toLocaleString()}
        </p>
        <p className="text-xs text-gray-600 mt-1">Typical range</p>
      </div>

      {/* Savings Banner */}
      {savings > 0 && (
        <div className="col-span-2 p-3 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              <span className="font-semibold">You Save</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">~${savings.toLocaleString()}</p>
              <p className="text-xs opacity-90">Save {savingsPercentage}% by doing it yourself</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}