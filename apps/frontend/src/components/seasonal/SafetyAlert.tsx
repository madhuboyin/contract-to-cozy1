// apps/frontend/src/components/seasonal/SafetyAlert.tsx
import React from 'react';
import { AlertTriangle, Zap, Flame, Droplet, Wind } from 'lucide-react';

interface SafetyAlertProps {
  warning: string;
  className?: string;
}

// Detect warning type based on keywords
function getWarningIcon(warning: string): React.ReactNode {
  const warningLower = warning.toLowerCase();
  
  if (warningLower.includes('electric') || warningLower.includes('voltage') || warningLower.includes('wire')) {
    return <Zap className="w-4 h-4 text-red-600" />;
  }
  if (warningLower.includes('gas') || warningLower.includes('fire') || warningLower.includes('burn')) {
    return <Flame className="w-4 h-4 text-red-600" />;
  }
  if (warningLower.includes('water') || warningLower.includes('flood') || warningLower.includes('leak')) {
    return <Droplet className="w-4 h-4 text-red-600" />;
  }
  if (warningLower.includes('carbon monoxide') || warningLower.includes('fumes') || warningLower.includes('ventilation')) {
    return <Wind className="w-4 h-4 text-red-600" />;
  }
  
  return <AlertTriangle className="w-4 h-4 text-red-600" />;
}

export function SafetyAlert({ warning, className = '' }: SafetyAlertProps) {
  const icon = getWarningIcon(warning);
  
  return (
    <div className={`flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-300 rounded-md ${className}`}>
      <div className="flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-red-900 mb-0.5">⚠️ Safety Warning</p>
        <p className="text-xs text-red-800">{warning}</p>
      </div>
    </div>
  );
}