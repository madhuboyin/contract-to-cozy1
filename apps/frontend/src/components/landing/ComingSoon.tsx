'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ComingSoon() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const PREVIEW_KEY = process.env.NEXT_PUBLIC_PREVIEW_KEY || 'contract2cozy2025';
    
    if (key === PREVIEW_KEY) {
      document.cookie = `preview_mode=true; path=/; max-age=31536000`;
      router.refresh();
    } else {
      setError('Invalid access key');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Logo & Title */}
        <div className="mb-12">
          <div className="inline-flex items-center justify-center space-x-3 text-white mb-6">
            <span className="text-6xl">🏠</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Contract to Cozy
          </h1>
          <div className="w-24 h-1 bg-white/30 mx-auto rounded-full"></div>
        </div>

        {/* Main Message */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-12 border border-white/20 shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Coming Soon
          </h2>
          <p className="text-xl text-white/90 mb-8">
            We're building something special. Check back soon!
          </p>

          {/* Simple Progress Indicator */}
          <div className="max-w-md mx-auto mb-8">
            <div className="bg-white/20 rounded-full h-2 overflow-hidden">
              <div className="bg-white h-full rounded-full animate-pulse" style={{ width: '90%' }}></div>
            </div>
            <p className="text-sm text-white/70 mt-2">90% Complete</p>
          </div>

          {/* Preview Access Toggle */}
          {!showKeyInput ? (
            <button
              onClick={() => setShowKeyInput(true)}
              className="text-white/60 hover:text-white text-sm transition-colors"
            >
              Preview Access
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-3">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter access key"
                className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 backdrop-blur-sm"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-200">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-white text-blue-700 rounded-lg font-semibold hover:bg-white/90 transition-colors"
                >
                  Access
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowKeyInput(false);
                    setKey('');
                    setError('');
                  }}
                  className="px-4 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-white/60 text-sm">
          <p>© 2025 Contract to Cozy. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
