// src/components/landing/Footer.tsx (Final version)

import React from 'react';
import { Home } from 'lucide-react';
// Note: This simplified footer is used in the new design.

export const Footer: React.FC = () => {
  return (
    <footer className="bg-stone-900 text-stone-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-6 md:mb-0">
            <div className="bg-stone-800 p-2 rounded-lg mr-3">
              <Home className="h-5 w-5 text-stone-200" />
            </div>
            <div>
              <span className="block text-stone-200 font-serif font-bold text-lg">Contract to Cozy</span>
              <span className="text-xs tracking-wider uppercase">Signature to Sanctuary</span>
            </div>
          </div>
          <div className="flex space-x-8 text-sm">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/help" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-stone-800 text-center text-xs">
          &copy; {new Date().getFullYear()} Contract to Cozy. All rights reserved.
        </div>
      </div>
    </footer>
  );
};