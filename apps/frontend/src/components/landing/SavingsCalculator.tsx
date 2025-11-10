'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SavingsCalculator() {
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [savings, setSavings] = useState({ total: 0, closing: 0, moveIn: 0, time: 0 });

  const calculateSavings = (e: React.FormEvent) => {
    e.preventDefault();

    // Base savings
    let totalSavings = 850;
    let closingSavings = 645;
    let moveInSavings = 205;
    let timeSavings = 15;

    // Price adjustments
    const priceNum = parseInt(price.replace(/,/g, ''));
    if (priceNum >= 1000000) {
      totalSavings += 200;
      closingSavings += 150;
      moveInSavings += 50;
    } else if (priceNum >= 750000) {
      totalSavings += 100;
      closingSavings += 75;
      moveInSavings += 25;
    }

    // Location adjustments
    const highCostAreas = ['Manhattan', 'San Francisco', 'Palo Alto', 'Brooklyn'];
    if (highCostAreas.some(area => location.includes(area))) {
      totalSavings += 150;
      closingSavings += 100;
      moveInSavings += 50;
    }

    setSavings({
      total: totalSavings,
      closing: closingSavings,
      moveIn: moveInSavings,
      time: timeSavings,
    });

    setShowResults(true);

    // Smooth scroll to results
    setTimeout(() => {
      document.getElementById('calculator-results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const formatCurrency = (value: string) => {
    const num = value.replace(/\D/g, '');
    return num ? parseInt(num).toLocaleString() : '';
  };

  return (
    <section id="calculator" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Calculate Your Savings
          </h2>
          <p className="text-lg md:text-xl text-gray-600">
            See how much time and money you'll save with Contract to Cozy
          </p>
        </div>

        {/* Calculator Card */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl shadow-xl p-8 md:p-12">
          <form onSubmit={calculateSavings} className="space-y-6">
            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-semibold text-gray-700 mb-2">
                Property Location
              </label>
              <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select your location</option>
                <option value="Manhattan, NY">Manhattan, NY</option>
                <option value="Brooklyn, NY">Brooklyn, NY</option>
                <option value="Queens, NY">Queens, NY</option>
                <option value="San Francisco, CA">San Francisco, CA</option>
                <option value="Palo Alto, CA">Palo Alto, CA</option>
                <option value="Austin, TX">Austin, TX</option>
                <option value="Boston, MA">Boston, MA</option>
                <option value="Seattle, WA">Seattle, WA</option>
                <option value="Chicago, IL">Chicago, IL</option>
                <option value="Denver, CO">Denver, CO</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Purchase Price */}
            <div>
              <label htmlFor="price" className="block text-sm font-semibold text-gray-700 mb-2">
                Purchase Price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
                  $
                </span>
                <input
                  type="text"
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(formatCurrency(e.target.value))}
                  placeholder="500,000"
                  required
                  className="w-full pl-8 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Closing Date */}
            <div>
              <label htmlFor="closingDate" className="block text-sm font-semibold text-gray-700 mb-2">
                Expected Closing Date
              </label>
              <input
                type="date"
                id="closingDate"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Calculate My Savings 💰
            </button>
          </form>

          {/* Results */}
          {showResults && (
            <div
              id="calculator-results"
              className="mt-8 bg-white rounded-xl shadow-lg p-8 animate-slide-up"
            >
              {/* Total Savings */}
              <div className="text-center mb-8 pb-8 border-b border-gray-200">
                <p className="text-gray-600 text-sm font-semibold uppercase mb-2">
                  Your Estimated Savings
                </p>
                <p className="text-5xl md:text-6xl font-bold text-green-600 mb-2">
                  ${savings.total.toLocaleString()}
                </p>
                <p className="text-lg text-gray-600">
                  Plus <span className="font-semibold text-blue-600">{savings.time} hours</span> saved
                </p>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    ${savings.closing}
                  </div>
                  <div className="text-sm text-gray-600">Closing Phase</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    ${savings.moveIn}
                  </div>
                  <div className="text-sm text-gray-600">Move-In</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    {savings.time}hrs
                  </div>
                  <div className="text-sm text-gray-600">Time Saved</div>
                </div>
              </div>

              {/* CTA */}
              <Link
                href="/signup"
                className="block w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-center hover:bg-green-700 transition-colors shadow-md"
              >
                Start Saving Now →
              </Link>

              <p className="text-center text-sm text-gray-500 mt-4">
                * Average savings based on 10,000+ transactions
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.5s ease-out;
        }
      `}</style>
    </section>
  );
}
