export default function Features() {
  const features = [
    {
      icon: '🔍',
      title: 'Verified Professionals',
      description: 'All providers are background-checked, licensed, and insured for your peace of mind.',
    },
    {
      icon: '💎',
      title: 'Transparent Pricing',
      description: 'No hidden fees. See upfront pricing and compare quotes from multiple providers.',
    },
    {
      icon: '⚡',
      title: 'Book in Minutes',
      description: 'Simple booking process. Schedule services at your convenience with instant confirmation.',
    },
  ];

  return (
    <section id="features" className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Why Choose Contract to Cozy?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to manage your home services in one place
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-6 bg-gradient-to-br from-teal-50 to-white rounded-xl border border-teal-100 hover:shadow-lg transition-all hover:border-teal-300 group"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
