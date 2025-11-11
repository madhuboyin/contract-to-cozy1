export default function HowItWorks() {
  const steps = [
    {
      number: '1',
      title: 'Search & Compare',
      description: 'Browse verified professionals and compare prices',
      icon: '🔍',
    },
    {
      number: '2',
      title: 'Book Online',
      description: 'Schedule service at your convenience with instant confirmation',
      icon: '📅',
    },
    {
      number: '3',
      title: 'Get It Done',
      description: 'Enjoy quality service and peace of mind',
      icon: '✅',
    },
  ];

  return (
    <section id="how-it-works" className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            How It Works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Get started in three simple steps
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connector Line (desktop only) */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-teal-200 -z-10" />
              )}

              {/* Step Card */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-primary-500 text-white rounded-full text-2xl font-bold mb-4 shadow-lg">
                  {step.number}
                </div>
                <div className="text-3xl mb-3">{step.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
