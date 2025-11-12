// apps/frontend/src/components/landing/Features.tsx
// Sleeker, more compact feature cards with reduced font sizes.

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
    <section id="features" className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-white"> {/* Slightly reduced vertical padding for the section itself */}
      <div className="max-w-7xl mx-auto">
        {/* Features Grid - Set to 4 columns on large screens for single row */}
        {/* Adjusted gap to be slightly smaller */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"> 
          {features.map((feature, index) => (
            <div
              key={index}
              // Reduced padding (p-5 -> p-4) and added flex for better alignment
              className="bg-white rounded-xl shadow-lg p-4 text-center transform hover:scale-105 transition-transform duration-300 border border-gray-100 flex flex-col items-center justify-start h-full"
            >
              {/* Icon size reduced (text-4xl -> text-3xl) and margin adjusted */}
              <div className="text-3xl mb-3">{feature.icon}</div> 
              {/* Title font size reduced (text-xl -> text-lg) */}
              <h3 className="text-lg font-semibold text-gray-900 mb-1.5">{feature.title}</h3> 
              {/* Description font size reduced (text-sm -> text-xs) */}
              <p className="text-gray-600 text-xs leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* CTA (Optional, kept it here) */}
        <div className="mt-10 text-center"> {/* Reduced top margin */}
          <Link
            href="/signup"
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-base font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md" // Slightly smaller button padding and font
          >
            Explore All Features
          </Link>
        </div>
      </div>
    </section>
  );
}