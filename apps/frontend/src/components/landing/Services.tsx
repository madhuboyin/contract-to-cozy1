// apps/frontend/src/components/landing/Services.tsx
// Updated with sleek/compact styling, consistent colors, and smaller fonts

import Link from 'next/link';
import { resolveIconByToken } from '@/lib/icons';

export default function Services() {
  const serviceCategories = [
    {
      title: 'Records & history',
      iconToken: 'clipboard-list',
      // color: 'bg-blue-50 border-blue-200 hover:border-blue-300', // <-- Removed for sleek consistency
      services: [
        'Documents & closing records',
        'Warranties & manuals',
        'Receipts & inspections',
        'Home timeline',
        'Appliances'
      ]
    },
    {
      title: 'Care & planning',
      iconToken: 'truck',
      // color: 'bg-green-50 border-green-200 hover:border-green-300', // <-- Removed for sleek consistency
      services: [
        'Maintenance',
        'Seasonal planning',
        'Repairs',
        'Projects',
        'Property health'
      ]
    },
    {
      title: 'Money & value',
      iconToken: 'wrench',
      // color: 'bg-purple-50 border-purple-200 hover:border-purple-300', // <-- Removed for sleek consistency
      services: [
        'Budgets & expenses',
        'Insurance',
        'Home value',
        'Savings & rebates',
        'Seller preparation'
      ]
    },
    {
      title: 'People & place',
      iconToken: 'zap',
      // color: 'bg-amber-50 border-amber-200 hover:border-amber-300', // <-- Removed for sleek consistency
      services: [
        'Trusted providers',
        'Neighborhood information',
        'Community knowledge',
        'Local recommendations',
        'Home guidance'
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
            Everything your home needs
          </h2>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            One connected home for the records, responsibilities, money, and people that shape homeownership.
          </p>
        </div>

        {/* Services Grid - Reduced gap */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {serviceCategories.map((category, index) => {
            const CategoryIcon = resolveIconByToken(category.iconToken);
            return (
              <div 
                key={index}
                // Standardized card style, removed category.color, reduced padding (p-6 to p-4)
                className="p-4 rounded-2xl border border-gray-100 transition-all duration-300 bg-white hover:shadow-lg"
              >
                {/* Icon & Title - Reduced icon size and margins */}
                <div className="text-center mb-3">
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <CategoryIcon className="h-5 w-5" />
                  </div>
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
            );
          })}
        </div>

        {/* CTA - Reduced top margin and button size */}
        <div className="text-center mt-10">
          <Link
            href="/signup"
            // Reduced padding and font size for a sleeker button
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
          >
            See everything in one place
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
