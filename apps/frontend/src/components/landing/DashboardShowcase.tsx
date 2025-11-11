import Link from 'next/link';

export default function DashboardShowcase() {
  const features = [
    {
      icon: '📊',
      title: 'Track Bookings',
      description: 'See status updates in real-time',
    },
    {
      icon: '🏠',
      title: 'Manage Properties',
      description: 'All your homes in one place',
    },
    {
      icon: '⭐',
      title: 'Save Providers',
      description: 'Rebook trusted professionals',
    },
    {
      icon: '💰',
      title: 'Monitor Budget',
      description: 'Track spending and savings',
    },
  ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text */}
          <div>
            <div className="inline-block px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-full mb-4">
              Dashboard Feature
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              One Dashboard. Zero Chaos.
            </h2>
            
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Finally, home services that make sense. From your first inspection to your last repair, 
              everything lives in one beautiful dashboard. Track bookings, manage properties, 
              save providers, and see exactly where every dollar goes.
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start">
                  <span className="text-2xl mr-3">{feature.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{feature.title}</div>
                    <div className="text-xs text-gray-600">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/signup"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
            >
              See Your Dashboard →
            </Link>
          </div>

          {/* Right Column - Dashboard Mockup */}
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 shadow-xl border border-gray-200">
              {/* Mock Dashboard */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-blue-600 text-white px-6 py-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">My Dashboard</h3>
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-blue-500 rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-200">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">3</div>
                    <div className="text-xs text-gray-600">Active Bookings</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">$850</div>
                    <div className="text-xs text-gray-600">Total Saved</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">2</div>
                    <div className="text-xs text-gray-600">Properties</div>
                  </div>
                </div>

                {/* Recent Bookings */}
                <div className="p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Bookings</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Home Inspection</div>
                          <div className="text-xs text-gray-500">Main Property</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                        Confirmed
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">HVAC Repair</div>
                          <div className="text-xs text-gray-500">Investment Property</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
                        Pending
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-200 rounded-full opacity-20 blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-200 rounded-full opacity-20 blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
