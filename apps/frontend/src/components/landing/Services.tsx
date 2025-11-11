export default function Services() {
  const services = [
    {
      category: 'Home Inspections',
      icon: '🏠',
      items: ['Pre-purchase', 'Annual', 'Pest', 'Radon'],
      color: 'from-teal-50 to-teal-100',
      border: 'border-teal-200',
    },
    {
      category: 'Repairs & Fixes',
      icon: '🔧',
      items: ['Plumbing', 'Electrical', 'HVAC', 'Appliances'],
      color: 'from-primary-50 to-primary-100',
      border: 'border-primary-200',
    },
    {
      category: 'Installations',
      icon: '⚙️',
      items: ['Fixtures', 'Appliances', 'Smart Home', 'Upgrades'],
      color: 'from-coral-50 to-coral-100',
      border: 'border-coral-200',
    },
    {
      category: 'Maintenance',
      icon: '✨',
      items: ['Cleaning', 'Landscaping', 'Seasonal', 'Preventive'],
      color: 'from-purple-50 to-purple-100',
      border: 'border-purple-200',
    },
  ];

  return (
    <section id="services" className="py-12 bg-gradient-to-br from-white to-teal-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            All Your Home Services
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From inspections to repairs, we've got you covered
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((service, index) => (
            <div
              key={index}
              className={`p-5 bg-gradient-to-br ${service.color} rounded-xl border ${service.border} hover:shadow-md transition-all group`}
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{service.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{service.category}</h3>
              <ul className="space-y-1.5">
                {service.items.map((item, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-center">
                    <span className="text-teal-600 mr-2 text-xs">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <button className="px-6 py-2.5 text-teal-600 font-medium hover:text-teal-700 transition-colors">
            View All Services →
          </button>
        </div>
      </div>
    </section>
  );
}
