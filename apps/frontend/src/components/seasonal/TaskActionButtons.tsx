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
    <div className="space-y-3">
      {/* Quick Actions Header */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
        <span className="text-sm font-semibold text-gray-700">Quick Actions:</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {/* Watch Tutorial Button */}
        {isDiyPossible && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors group"
          >
            <Youtube className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <p className="font-medium text-red-900 text-sm">Watch Tutorial</p>
              <p className="text-xs text-red-600">Step-by-step video guide</p>
            </div>
            <ExternalLink className="w-4 h-4 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        )}

        {/* Materials List Button */}
        {isDiyPossible && materialsList && (
          <button
            onClick={() => {
              // Could open a modal or expand section
              alert(`Materials needed:\n\n${materialsList}`);
            }}
            className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-left"
          >
            <FileText className="w-5 h-5 text-blue-600" />
            <div className="flex-1">
              <p className="font-medium text-blue-900 text-sm">View Materials List</p>
              <p className="text-xs text-blue-600">Tools & supplies needed</p>
            </div>
          </button>
        )}

        {/* Find Professional Button */}
        {serviceCategory && (
          <Link
            href={`/dashboard/providers?category=${serviceCategory}`}
            className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors group"
          >
            <Phone className="w-5 h-5 text-green-600" />
            <div className="flex-1">
              <p className="font-medium text-green-900 text-sm">Find Professional</p>
              <p className="text-xs text-green-600">Get quotes from local pros</p>
            </div>
            <ExternalLink className="w-4 h-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        )}
      </div>
    </div>
  );
}