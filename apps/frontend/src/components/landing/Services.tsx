// apps/frontend/src/components/landing/Services.tsx
// Updated with sleek/compact styling, consistent colors, and smaller fonts

import Link from 'next/link';

export default function Services() {
  const serviceCategories = [
    {
      title: 'Closing Phase',
      icon: '📋',
      // color: 'bg-blue-50 border-blue-200 hover:border-blue-300', // <-- Removed for sleek consistency
      services: [
        'Home Inspection',
        'Insurance',
        'Title Services',
        'Real Estate Attorney',
        'Appraisal'
      ]
    },
    {
      title: 'Move-In',
      icon: '🚚',
      // color: 'bg-green-50 border-green-200 hover:border-green-300', // <-- Removed for sleek consistency
      services: [
        'Moving Services',
        'Utility Setup',
        'Internet & Cable',
        'Locksmith',
        'Cleaning Services'
      ]
    },
    {
      title: 'Maintenance',
      icon: '🔧',
      // color: 'bg-purple-50 border-purple-200 hover:border-purple-300', // <-- Removed for sleek consistency
      services: [
        'HVAC Service',
        'Dryer Vent Cleaning',
        'Chimney Inspection',
        'Gutter Cleaning',
        'Pest Control'
      ]
    },
    {
      title: 'Upgrades',
      icon: '⚡',
      // color: 'bg-amber-50 border-amber-200 hover:border-amber-300', // <-- Removed for sleek consistency
      services: [
        'Solar Installation',
        'Window Replacement',
        'Smart Home Setup',
        'Energy Audit',
        'Landscaping'
      ]
    }
  ];

  return (
    // Reduced vertical padding
    <section id="services" className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Header - Reduced font size and margins */}
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Services We Cover
          </h2>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            From inspection to move-in and beyond, we've got you covered
          </p>
        </div>

        {/* Services Grid - Reduced gap */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {serviceCategories.map((category, index) => (
            <div 
              key={index}
              // Standardized card style, removed category.color, reduced padding (p-6 to p-4)
              className="p-4 rounded-2xl border border-gray-100 transition-all duration-300 bg-white hover:shadow-lg"
            >
              {/* Icon & Title - Reduced icon size and margins */}
              <div className="text-center mb-3">
                <div className="text-3xl mb-2">{category.icon}</div>
                <h3 className="text-base font-semibold text-gray-900">
                  {category.title}
                </h3>
              </div>

              {/* Services List - Reduced list item font size (text-sm to text-xs) */}
              <ul className="space-y-1.5">
                {category.services.map((service, idx) => (
                  <li key={idx} className="flex items-start text-xs text-gray-700">
                    <span className="mr-2 text-blue-600 font-bold">·</span>
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA - Reduced top margin and button size */}
        <div className="text-center mt-10">
          <Link
            href="/signup"
            // Reduced padding and font size for a sleeker button
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
          >
            Browse All Services
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}