'use client';

import { useEffect, useState } from 'react';
import ComingSoon from '@/components/landing/ComingSoon';

export default function PreviewModeWrapper({ children }: { children: React.ReactNode }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const adminKey = urlParams.get('key');

    if (adminKey) {
      // Validate the URL key server-side so it is never compared in the browser.
      fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey }),
      }).then((res) => {
        setIsPreviewMode(res.ok);
        setIsLoading(false);
      });
      return;
    }

    const hasPreviewCookie = document.cookie
      .split('; ')
      .some(row => row.startsWith('preview_mode=true'));

    setIsPreviewMode(hasPreviewCookie);
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
