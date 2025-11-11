// apps/frontend/src/components/landing/Services.tsx
// Updated with lighter colors and smaller fonts

import Link from 'next/link';

export default function Services() {
  const serviceCategories = [
    {
      title: 'Closing Phase',
      icon: '📋',
      color: 'bg-blue-50 border-blue-200 hover:border-blue-300',
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
      color: 'bg-green-50 border-green-200 hover:border-green-300',
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
      color: 'bg-purple-50 border-purple-200 hover:border-purple-300',
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
      color: 'bg-amber-50 border-amber-200 hover:border-amber-300',
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
    <section id="services" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Services We Cover
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From inspection to move-in and beyond, we've got you covered
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {serviceCategories.map((category, index) => (
            <div 
              key={index}
              className={`p-6 rounded-2xl border-2 transition-all duration-300 ${category.color} hover:shadow-lg`}
            >
              {/* Icon & Title */}
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">{category.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {category.title}
                </h3>
              </div>

              {/* Services List */}
              <ul className="space-y-2">
                {category.services.map((service, idx) => (
                  <li key={idx} className="flex items-start text-sm text-gray-700">
                    <span className="mr-2 text-blue-600 font-bold">·</span>
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/signup"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
          >
            Browse All Services
            <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
