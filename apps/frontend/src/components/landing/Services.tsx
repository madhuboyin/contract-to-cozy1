import Link from 'next/link';

export default function Services() {
  const serviceCategories = [
    {
      icon: '📋',
      title: 'Closing Phase',
      services: [
        'Home Inspection',
        'Insurance',
        'Title & Escrow',
        'Attorney',
        'Appraisal',
      ],
    },
    {
      icon: '🏡',
      title: 'Move-In',
      services: [
        'Moving Services',
        'Utilities Setup',
        'Internet & Cable',
        'Locksmith',
        'House Cleaning',
      ],
    },
    {
      icon: '🔧',
      title: 'Maintenance',
      services: [
        'HVAC Service',
        'Dryer Vent Cleaning',
        'Chimney Sweep',
        'Gutter Cleaning',
        'Pest Control',
      ],
    },
    {
      icon: '⚡',
      title: 'Upgrades',
      services: [
        'Solar Installation',
        'Window Replacement',
        'Smart Home Setup',
        'Energy Audit',
        'Landscaping',
      ],
    },
  ];

  return (
    <section id="services" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Complete Home Services
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need for your homebuying journey
          </p>
        </div>

        {/* Service Categories Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {serviceCategories.map((category, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-8 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100"
            >
              {/* Category Header */}
              <div className="flex items-center space-x-3 mb-6">
                <span className="text-4xl">{category.icon}</span>
                <h3 className="text-2xl font-semibold text-gray-900">
                  {category.title}
                </h3>
              </div>

              {/* Services List */}
              <ul className="space-y-3">
                {category.services.map((service, serviceIndex) => (
                  <li
                    key={serviceIndex}
                    className="flex items-center text-gray-700"
                  >
                    <svg
                      className="w-5 h-5 text-green-500 mr-3 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Browse All Services CTA */}
        <div className="text-center">
          <Link
            href="/providers/search"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-blue-600 bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors shadow-md"
          >
            Browse All Services
            <svg
              className="ml-2 w-5 h-5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
