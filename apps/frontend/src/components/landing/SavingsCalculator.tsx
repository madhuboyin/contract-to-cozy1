// apps/frontend/src/components/landing/SavingsCalculator.tsx
// Compact version with reduced height

'use client';

import { useState } from 'react';
import Link from 'next/link';

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
    <section id="calculator" className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Section Header - Compact */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Calculate Your Savings
          </h2>
          <p className="text-base text-gray-600">
            See how much time and money you'll save
          </p>
        </div>

        {/* Calculator Card - Compact */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 md:p-8">
          <form onSubmit={calculateSavings} className="space-y-4">
            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1.5">
                Property Location
              </label>
              <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            {/* Purchase Price */}
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">
                Purchase Price
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
                  className="w-full pl-8 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Closing Date */}
            <div>
              <label htmlFor="closingDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                Expected Closing Date
              </label>
              <input
                type="date"
                id="closingDate"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              Calculate My Savings
            </button>
          </form>

          {/* Results - Compact */}
          {results && (
            <div className="mt-6 pt-6 border-t border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                Your Potential Savings
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">${results.moneySaved}</div>
                  <div className="text-xs text-gray-600 mt-1">Money Saved</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">{results.timeSaved}h</div>
                  <div className="text-xs text-gray-600 mt-1">Time Saved</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">{results.providerCount}</div>
                  <div className="text-xs text-gray-600 mt-1">Providers</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <Link
                  href="/signup"
                  className="inline-block px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                >
                  Get Started →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
