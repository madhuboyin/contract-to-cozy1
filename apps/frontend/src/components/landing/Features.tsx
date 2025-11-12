// apps/frontend/src/components/landing/Features.tsx
// All differentiators and capabilities in one crisp table.
// This component is designed to be a standalone section, NOT part of the Hero background.

import Link from "next/link";

export default function Features() {
  const features = [
    {
      icon: '✨',
      title: 'Effortless Home Management',
      description: 'Centralize all your home maintenance, repairs, and upgrades in one intuitive dashboard.',
    },
    {
      icon: '🤝',
      title: 'Trusted Local Professionals',
      description: 'Connect with fully vetted, licensed, and insured experts in your neighborhood.',
    },
    {
      icon: '💰',
      title: 'Transparent Pricing & Savings',
      description: 'Get upfront, guaranteed quotes and track your savings on every service.',
    },
    {
      icon: '🔔',
      title: 'Never Miss a Beat',
      description: 'Automated reminders for routine maintenance and upcoming service appointments.',
    },
  ];

  return (
    // This section will appear AFTER your Hero component in your main page file.
    <section id="features" className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Features Grid - Set to 4 columns on large screens for single row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-lg p-6 text-center transform hover:scale-105 transition-transform duration-300 border border-gray-100"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* CTA (Optional, kept it here) */}
        <div className="mt-12 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            Explore All Features
          </Link>
        </div>
      </div>
    </section>
  );
}