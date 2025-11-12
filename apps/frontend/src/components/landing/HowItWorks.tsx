// apps/frontend/src/components/landing/HowItWorks.tsx
// Sleeker & more compact "How It Works" section with reduced padding and simplified design.

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
    // Reduced vertical padding (py-10/12 to py-8/10)
    <section id="how-it-works" className="py-8 md:py-10 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header - Reduced font size (text-2xl/3xl to text-xl/2xl) */}
        <div className="text-center mb-8 md:mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-3"> {/* Reduced mb- */}
            How It Works
          </h2>
          <p className="text-sm text-gray-600 max-w-2xl mx-auto"> {/* Reduced font size to text-sm */}
            Get started in four simple steps
          </p>
        </div>

        {/* Steps - Reduced gap */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Reduced card padding (p-6 to p-4) */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
                {/* Step Number Badge (Kept size for readability) */}
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                  {step.number}
                </div>

                {/* Icon - Reduced size (text-5xl to text-4xl) and margin (mt-4 mb-4 to mt-3 mb-3) */}
                <div className="text-4xl mb-3 mt-3 text-center">{step.icon}</div>

                {/* Content - Reduced font size and margin */}
                <h3 className="text-base font-semibold text-gray-900 mb-1 text-center">
                  {step.title}
                </h3>
                <p className="text-xs text-gray-600 text-center leading-relaxed">
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