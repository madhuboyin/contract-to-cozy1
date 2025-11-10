'use client';

import { useEffect, useState } from 'react';
import ComingSoon from '@/components/landing/ComingSoon';

export default function PreviewModeWrapper({ children }: { children: React.ReactNode }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for preview mode cookie
    const hasPreviewCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('preview_mode='))
      ?.split('=')[1] === 'true';

    // Check for preview query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const hasPreviewParam = urlParams.get('preview') === 'true';

    // Check for admin key in URL
    const adminKey = urlParams.get('key');
    const PREVIEW_KEY = process.env.NEXT_PUBLIC_PREVIEW_KEY || 'contract2cozy2025';
    const hasValidKey = adminKey === PREVIEW_KEY;

    // If URL has valid key, set the cookie
    if (hasValidKey || hasPreviewParam) {
      document.cookie = `preview_mode=true; path=/; max-age=31536000`;
      setIsPreviewMode(true);
    } else {
      setIsPreviewMode(hasPreviewCookie);
    }

    setIsLoading(false);
  }, []);

  // Show loading state briefly to prevent flash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // Show real site if in preview mode
  if (isPreviewMode) {
    return <>{children}</>;
  }

  // Show coming soon page by default
  return <ComingSoon />;
}
