// apps/frontend/src/components/landing/Features.tsx
// Updated with lighter colors and smaller fonts

export default function Features() {
  const features = [
    {
      icon: '🏘️',
      title: 'Local Experts',
      description: 'Connect with verified professionals in your neighborhood who know your area best.'
    },
    {
      icon: '💰',
      title: 'Transparent Pricing',
      description: 'See upfront costs and compare quotes. No surprises, no hidden fees.'
    },
    {
      icon: '⚡',
      title: 'Book Fast',
      description: 'Find and book qualified professionals in minutes, not days or weeks.'
    },
    {
      icon: '🛡️',
      title: 'Trusted & Verified',
      description: 'All providers are background-checked, licensed, and insured for your peace of mind.'
    },
    {
      icon: '📱',
      title: 'Easy Management',
      description: 'Track all your home services in one place. Schedule, manage, and review with ease.'
    },
    {
      icon: '🎯',
      title: 'Complete Journey',
      description: 'From inspection to move-in to maintenance - we cover every step of your home journey.'
    }
  ];

  return (
    <section id="features" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Choose Contract to Cozy?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to manage your home services in one simple platform
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
