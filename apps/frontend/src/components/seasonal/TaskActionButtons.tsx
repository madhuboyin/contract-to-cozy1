// apps/frontend/src/components/seasonal/TaskActionButtons.tsx
import React from 'react';
import { Youtube, FileText, Phone, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface TaskActionButtonsProps {
  tutorialUrl?: string;
  materialsList?: string;
  serviceCategory?: string;
  taskTitle: string;
  isDiyPossible: boolean;
}

export function TaskActionButtons({ 
  tutorialUrl, 
  materialsList, 
  serviceCategory,
  taskTitle,
  isDiyPossible
}: TaskActionButtonsProps) {
  // Generate YouTube search URL if no specific tutorial provided
  const youtubeUrl = tutorialUrl || 
    `https://www.youtube.com/results?search_query=${encodeURIComponent(taskTitle + ' DIY home maintenance')}`;

  return (
    <div className="space-y-2">
      {/* Quick Actions - Compact horizontal layout */}
      <div className="flex items-center gap-3 sm:gap-2 flex-wrap">
        {/* Watch Tutorial Button */}
        {isDiyPossible && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors text-xs group"
          >
            <Youtube className="w-3.5 h-3.5 text-red-600" />
            <span className="font-medium text-red-900">Tutorial</span>
            <ExternalLink className="w-3 h-3 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        )}

        {/* Materials List Button */}
        {isDiyPossible && materialsList && (
          <button
            onClick={() => {
              alert(`Materials needed:\n\n${materialsList}`);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-medium text-blue-900">Materials</span>
          </button>
        )}

        {/* Find Professional Button */}
        {serviceCategory && (
          <Link
            href={`/dashboard/providers?category=${serviceCategory}`}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors text-xs group"
          >
            <Phone className="w-3.5 h-3.5 text-green-600" />
            <span className="font-medium text-green-900">Find Pro</span>
            <ExternalLink className="w-3 h-3 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        )}
      </div>
    </div>
  );
}