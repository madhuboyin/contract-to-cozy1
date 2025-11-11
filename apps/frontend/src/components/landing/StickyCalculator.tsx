'use client';

import { useState } from 'react';

export default function StickyCalculator() {
  const [propertyValue, setPropertyValue] = useState(350000);
  const [services, setServices] = useState({
    inspection: true,
    repairs: true,
    maintenance: false,
  });

  const calculateSavings = () => {
    let total = 0;
    if (services.inspection) total += 850;
    if (services.repairs) total += 1200;
    if (services.maintenance) total += 450;
    return total;
  };

  const savings = calculateSavings();

  return (
    <div className="sticky top-20 bg-white rounded-2xl shadow-xl border-2 border-teal-200 p-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-3xl mb-2">💰</div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Calculate Savings</h3>
        <p className="text-sm text-gray-600">See how much you can save</p>
      </div>

      {/* Property Value */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Property Value
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-500">$</span>
          <input
            type="number"
            value={propertyValue}
            onChange={(e) => setPropertyValue(Number(e.target.value))}
            className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Services */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Services Needed
        </label>
        <div className="space-y-2">
          <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-teal-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={services.inspection}
              onChange={(e) => setServices({ ...services, inspection: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Home Inspection</div>
              <div className="text-xs text-gray-500">Save ~$850</div>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-teal-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={services.repairs}
              onChange={(e) => setServices({ ...services, repairs: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Repairs & Fixes</div>
              <div className="text-xs text-gray-500">Save ~$1,200</div>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-teal-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={services.maintenance}
              onChange={(e) => setServices({ ...services, maintenance: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Maintenance</div>
              <div className="text-xs text-gray-500">Save ~$450</div>
            </div>
          </label>
        </div>
      </div>

      {/* Result */}
      <div className="bg-gradient-to-br from-teal-50 to-primary-50 rounded-xl p-6 text-center border border-teal-200">
        <div className="text-sm text-gray-600 mb-1">Your Estimated Savings</div>
        <div className="text-4xl font-bold text-teal-600 mb-3">${savings.toLocaleString()}</div>
        <p className="text-xs text-gray-600 mb-4">Based on platform average</p>
        <button className="w-full px-4 py-2.5 bg-coral-500 text-white text-sm font-medium rounded-lg hover:bg-coral-600 transition-colors shadow-sm">
          Get Started Free
        </button>
      </div>

      {/* Trust Badge */}
      <div className="mt-4 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-500">
          <span className="text-teal-600 font-medium">✓</span> No credit card required
        </p>
      </div>
    </div>
  );
}
