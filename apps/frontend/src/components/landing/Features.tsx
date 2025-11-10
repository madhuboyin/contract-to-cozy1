export default function Features() {
  const features = [
    {
      icon: '🏘️',
      title: 'Neighborhood Verified',
      description: 'Book providers your neighbors trust. See real work done on your street.',
    },
    {
      icon: '💰',
      title: 'Transparent Savings',
      description: 'Compare verified quotes. Save an average of $850+ per home transaction.',
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Book services in minutes, not days. Skip the endless phone calls and quotes.',
    },
    {
      icon: '🤝',
      title: 'Trusted Providers',
      description: 'Background-checked, insured, and licensed professionals only.',
    },
    {
      icon: '📱',
      title: 'Mobile First',
      description: 'Manage everything from your phone. Track progress, message providers, pay securely.',
    },
    {
      icon: '🎯',
      title: 'Complete Journey',
      description: 'From inspection to move-in. One platform for all your home service needs.',
    },
  ];

  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Why Homebuyers Love Us
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to turn your new house into a cozy home
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-8 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border border-gray-100"
            >
              <div className="text-5xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
