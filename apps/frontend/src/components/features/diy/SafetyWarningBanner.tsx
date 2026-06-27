'use client';
import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  level?: 'moderate' | 'high';
}

export default function SafetyWarningBanner({ message, level = 'high' }: Props) {
  const colors = level === 'high'
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-yellow-50 border-yellow-200 text-yellow-800';

  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${colors}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
