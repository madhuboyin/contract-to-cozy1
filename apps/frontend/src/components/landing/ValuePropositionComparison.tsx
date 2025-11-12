// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import Link from 'next/link';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    // --- DIFFERENTIATORS (The UVPs) ---
    {
      icon: '🔑',
      title: 'Unified Closure Services',
      cozy: 'One platform for inspection, attorney, and insurance vendor coordination.',
      competitor: 'Separate vendors, manual communication, and disjointed scheduling required.'
    },
    {
      icon: '🖥️',
      title: 'Single Pane Dashboard',
      cozy: 'All bookings, property documents, and budget history in one beautiful interface.',
      competitor: 'Tracking services using spreadsheets, emails, and phone notes.'
    },
    {
      icon: '🔔',
      title: 'Annual Reminders',
      cozy: 'Automatic reminders for maintenance (e.g., duct cleaning, pest control).',
      competitor: 'Homeowner must manually track and remember service cycles.'
    },
    {
      icon: '⭐',
      title: 'Neighborhood Trust',
      cozy: 'Pros vetted and rated by your actual neighbors with local job history.',
      competitor: 'Generic city-wide reviews and simple rating systems.'
    },

    // --- CORE CAPABILITIES (The Necessities - Added from Features.tsx) ---
    {
      icon: '💰',
      title: 'Transparent Pricing',
      cozy: 'See upfront costs and guaranteed quotes before booking.',
      competitor: 'Hidden fees, estimated quotes that often change upon arrival.'
    },
    {
      icon: '⚡',
      title: 'Book Fast',
      cozy: 'Find, compare, and book qualified pros in minutes.',
      competitor: 'Calling multiple vendors and waiting days for callbacks or quotes.'
    },
    {
      icon: '🛡️',
      title: 'Trusted & Verified',
      cozy: 'All pros are background-checked, licensed, and insured for your peace of mind.',
      competitor: 'User must manually verify license and insurance details themselves.'
    },
  ];

  return (
    // Reduced vertical padding and changed background to bg-gray-50 for alternating color
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Reduced header font size and margins */}
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            The Cozy Way vs. The Old Way
          </h2>
          <p className="text-base text-gray-600 max-w-3xl mx-auto">
            See how we transform the chaos of home services into a simple, managed experience.
          </p>
        </div>

        {/* Comparison Table Structure (Using Grid) */}
        {/* Set bg-white on table for contrast with gray section background */}
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xl bg-white">
          
          {/* Table Header */}
          <div className="grid grid-cols-3 font-bold text-sm sm:text-base bg-gray-100 text-gray-700 uppercase tracking-wider">
            <div className="p-4 border-r border-gray-200">Key Feature</div>
            <div className="p-4 border-r border-gray-200 text-center text-blue-600">The Cozy Way</div>
            <div className="p-4 text-center text-red-600">The Old Way</div>
          </div>

          {/* Table Rows */}
          {comparisonPoints.map((point, index) => (
            <div 
              key={index} 
              // Alternating row color is now self-contained in the white-background table
              className={`grid grid-cols-3 items-center ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-200 transition-all hover:bg-blue-50`}
            >
              
              {/* Column 1: Feature Title */}
              <div className="p-4 border-r border-gray-200 flex items-center">
                <span className="text-2xl mr-3">{point.icon}</span>
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                  {point.title}
                </h3>
              </div>

              {/* Column 2: The Cozy Way (Thumbs Up) */}
              <div className="p-4 border-r border-gray-200">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl text-green-500">👍</span>
                  <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                </div>
              </div>

              {/* Column 3: The Old Way (Thumbs Down) */}
              <div className="p-4">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl text-red-500">👎</span>
                  <p className="text-sm text-gray-700 leading-snug">{point.competitor}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Final CTA - Reduced top margin */}
        <div className="mt-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to simplify your home management?
          </h3>
          {/* UPDATED BUTTON: Reduced padding (px-8 py-4 to px-6 py-3) and font size (text-lg to text-base) */}
          <Link
            href="/signup"
            className="inline-block px-6 py-3 bg-blue-600 text-white text-base font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            Create Your Free Account →
          </Link>
        </div>
      </div>
    </section>
  );
}