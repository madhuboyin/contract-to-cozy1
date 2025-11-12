// apps/frontend/src/components/landing/ValuePropositionComparison.tsx

import Link from 'next/link';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    {
      icon: '🔑',
      title: 'Unified Closure Services',
      cozy: 'One platform for inspection, attorney, and insurance vendor coordination.',
      competitor: 'Separate vendors, manual communication, and disjointed scheduling.'
    },
    {
      icon: '🖥️',
      title: 'Single Pane Dashboard',
      cozy: 'Track all bookings, documents, and budget history in one beautiful interface.',
      competitor: 'Spreadsheets, email inboxes, and notes for tracking home services.'
    },
    {
      icon: '🔔',
      title: 'Annual Maintenance Reminders',
      cozy: 'Automatic reminders for duct cleaning, pest control, chimney sweeping, and re-booking.',
      competitor: 'No reminders—maintenance cycles are the homeowner’s responsibility.'
    },
    {
      icon: '⭐',
      title: 'Vetted Neighborhood Reviews',
      cozy: 'Connect with pros rated by your actual neighbors and see local job history.',
      competitor: 'Generic city-wide reviews or ratings that lack local trust signals.'
    },
  ];

  return (
    <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Beyond Booking: What Makes Us Different
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            We cover the entire home journey, from closing services to long-term maintenance.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="space-y-12">
          {comparisonPoints.map((point, index) => (
            <div 
              key={index} 
              className="grid lg:grid-cols-3 gap-8 items-center bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100"
            >
              {/* Feature Title Column */}
              <div className="text-center lg:text-left">
                <span className="text-4xl mb-2 block">{point.icon}</span>
                <h3 className="text-xl font-bold text-gray-900">{point.title}</h3>
              </div>

              {/* Contract to Cozy Column */}
              <div className="p-4 border-l-4 border-blue-600 bg-blue-50/70 rounded-lg shadow-sm h-full flex items-center">
                <p className="text-sm font-semibold text-gray-800">
                  <span className="text-blue-600 mr-2">The Cozy Way:</span> {point.cozy}
                </p>
              </div>

              {/* Competitor Column */}
              <div className="p-4 border-l-4 border-gray-300 bg-gray-100/70 rounded-lg shadow-sm h-full flex items-center">
                <p className="text-sm text-gray-600">
                  <span className="text-gray-700 mr-2 font-semibold">The Old Way:</span> {point.competitor}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Stop the Chaos. Start Your Dashboard.
          </h3>
          <Link
            href="/signup"
            className="inline-block px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
          >
            Create Your Free Account →
          </Link>
        </div>
      </div>
    </section>
  );
}