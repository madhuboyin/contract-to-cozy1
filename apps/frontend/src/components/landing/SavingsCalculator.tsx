// apps/frontend/src/components/landing/SavingsCalculator.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

export default function SavingsCalculator() {
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [results, setResults] = useState<any>(null);

  const calculateSavings = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple calculation logic
    const numericPrice = parseInt(price.replace(/,/g, '')) || 0;
    const timeSaved = 15; // hours
    const moneySaved = Math.floor(numericPrice * 0.001 + 500); // ~$500-1000 savings
    const providerCount = 24;

    setResults({
      timeSaved,
      moneySaved,
      providerCount,
    });
  };

  const formatNumber = (num: string) => {
    return num ? parseInt(num).toLocaleString() : '';
  };

  return (
    <section id="calculator" className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Free, no account needed
          </span>
          <h2 className="mt-4 text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            See what your home qualifies for
          </h2>
          <p className="text-base text-gray-600">Tax credits, rebates, and refinancing opportunities tied to your specific property. Takes 30 seconds.</p>
        </div>

        {/* Calculator Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 md:p-8">
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {['Tax credits', 'Insurance', 'Utility rebates', 'Refinancing'].map((item) => (
              <span key={item} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700">{item}</span>
            ))}
          </div>

          <form onSubmit={calculateSavings} className="space-y-4">
            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1.5">
                Property location
              </label>
              <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="">Select your location</option>
                <option value="Manhattan, NY">Manhattan, NY</option>
                <option value="Brooklyn, NY">Brooklyn, NY</option>
                <option value="Queens, NY">Queens, NY</option>
                <option value="San Francisco, CA">San Francisco, CA</option>
                <option value="Palo Alto, CA">Palo Alto, CA</option>
                <option value="Los Angeles, CA">Los Angeles, CA</option>
                <option value="Boston, MA">Boston, MA</option>
                <option value="Chicago, IL">Chicago, IL</option>
              </select>
            </div>

            {/* Purchase Price + Purchase Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Purchase price
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500 text-sm">$</span>
                  <input
                    type="text"
                    id="price"
                    value={formatNumber(price)}
                    onChange={(e) => setPrice(e.target.value.replace(/,/g, ''))}
                    placeholder="500,000"
                    required
                    className="w-full pl-8 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="closingDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Purchase date
                </label>
                <input
                  type="date"
                  id="closingDate"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors shadow-md hover:shadow-lg"
            >
              Find my opportunities
            </button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <Lock className="h-3.5 w-3.5" />
              Used only to match savings programs. Never sold or shared.
            </p>
          </form>

          {/* Results */}
          {results && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                Potential opportunities for your home
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">${results.moneySaved}</div>
                  <div className="text-xs text-gray-600 mt-1">Potential value</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">{results.timeSaved}h</div>
                  <div className="text-xs text-gray-600 mt-1">Research saved</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">{results.providerCount}</div>
                  <div className="text-xs text-gray-600 mt-1">Opportunities checked</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <Link
                  href="/signup"
                  className="inline-block px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors shadow-md"
                >
                  Save opportunities to my home →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
