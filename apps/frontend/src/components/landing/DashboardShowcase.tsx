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
    // Reduced vertical padding
    <section className="py-10 md:py-12 bg-white"> 
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          
          {/* Left Column - Text (Sleeker fonts, tighter spacing) */}
          <div>
            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-3">
              Dashboard Feature
            </div>
            
            {/* Reduced font size and margin */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              One Dashboard. Zero Chaos.
            </h2>
            
            {/* Reduced font size and margin */}
            <p className="text-base text-gray-600 mb-6 leading-relaxed">
              Finally, home services that make sense. From your first inspection to your last repair, 
              everything lives in one beautiful dashboard. Track bookings, manage properties, 
              save providers, and see exactly where every dollar goes.
            </p>

            {/* Features Grid - Reduced margin */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start">
                  {/* Icon size and margin are already compact, kept as is */}
                  <span className="text-2xl mr-3">{feature.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{feature.title}</div>
                    <div className="text-xs text-gray-600">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reduced button size */}
            <Link
              href="/signup"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
            >
              See Your Dashboard →
            </Link>
          </div>

          {/* Right Column - Dashboard Mockup (Sleek internal padding) */}
          <div className="relative">
            {/* Reduced outer padding (p-8 to p-6) */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-xl border border-gray-200">
              {/* Mock Dashboard */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Header - Reduced padding (px-6 py-4 to px-4 py-3) and font size (text-lg to text-base) */}
                <div className="bg-blue-600 text-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">My Dashboard</h3>
                    <div className="flex items-center space-x-2">
                      {/* Reduced avatar size */}
                      <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* Stats - Reduced padding (p-6 to p-4) and font size (text-2xl to text-xl) */}
                <div className="grid grid-cols-3 gap-4 p-4 border-b border-gray-200">
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600">3</div>
                    <div className="text-xs text-gray-600">Active Bookings</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">$850</div>
                    <div className="text-xs text-gray-600">Total Saved</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-purple-600">2</div>
                    <div className="text-xs text-gray-600">Properties</div>
                  </div>
                </div>

                {/* Recent Bookings - Reduced padding (p-6 to p-4) and internal padding (p-3 to p-2) */}
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Bookings</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
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
                    
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
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

              {/* Decorative Elements (Unchanged) */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-200 rounded-full opacity-20 blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-200 rounded-full opacity-20 blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}