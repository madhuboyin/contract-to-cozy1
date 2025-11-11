// apps/frontend/src/components/landing/HowItWorks.tsx
// Updated with lighter colors and smaller fonts

export default function HowItWorks() {
  const steps = [
    {
      number: '1',
      title: 'Enter Your Details',
      description: 'Tell us about your property and the services you need',
      icon: '🏠'
    },
    {
      number: '2',
      title: 'Browse Providers',
      description: 'Compare verified local professionals with transparent pricing',
      icon: '🔍'
    },
    {
      number: '3',
      title: 'Book Services',
      description: 'Schedule appointments that work for your timeline',
      icon: '📅'
    },
    {
      number: '4',
      title: 'Move In Happy',
      description: 'Enjoy your new home with confidence and peace of mind',
      icon: '✨'
    }
  ];

  return (
    <section id="how-it-works" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Get started in four simple steps
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all">
                {/* Step Number Badge */}
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="text-5xl mb-4 mt-4 text-center">{step.icon}</div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-600 text-center leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Arrow between steps (desktop only) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 text-blue-300 text-2xl">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
