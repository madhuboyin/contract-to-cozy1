import Link from 'next/link';
import { resolveIconByToken } from '@/lib/icons';

export default function DashboardShowcase() {
  const features = [
    {
      iconToken: 'layout-grid',
      title: 'Home records',
      description: 'Documents, insurance, warranties',
    },
    {
      iconToken: 'building-2',
      title: 'Plans & projects',
      description: 'Maintenance and improvements',
    },
    {
      iconToken: 'badge-check',
      title: 'Home history',
      description: 'A timeline that stays complete',
    },
    {
      iconToken: 'dollar-sign',
      title: 'Money & value',
      description: 'Budgets, savings, and equity',
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
              Your home, connected
            </div>
            
            {/* Reduced font size and margin */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Your home&apos;s digital headquarters
            </h2>
            
            {/* Reduced font size and margin */}
            <p className="text-base text-gray-600 mb-6 leading-relaxed">
              Everything about your home has a place here: documents, projects, maintenance, budgets, insurance, property health, neighborhood knowledge, home value, savings, and trusted help.
            </p>

            {/* Features Grid - Reduced margin */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {features.map((feature, index) => {
                const FeatureIcon = resolveIconByToken(feature.iconToken);
                return (
                <div key={index} className="flex items-start">
                  {/* Icon size and margin are already compact, kept as is */}
                  <span className="mr-3 mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <FeatureIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{feature.title}</div>
                    <div className="text-xs text-gray-600">{feature.description}</div>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Reduced button size */}
            <Link
              href="/signup"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
            >
              Explore your home →
            </Link>
          </div>

          {/* Right Column - Dashboard Mockup (desktop only; too dense to read at mobile widths) */}
          <div className="relative hidden lg:block">
            {/* Reduced outer padding (p-8 to p-6) */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-xl border border-gray-200">
              {/* Mock Dashboard */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Header - Reduced padding (px-6 py-4 to px-4 py-3) and font size (text-lg to text-base) */}
                <div className="bg-blue-600 text-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">14 Maple Street</h3>
                    <div className="flex items-center space-x-2">
                      {/* Reduced avatar size */}
                      <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* Stats - Reduced padding (p-6 to p-4) and font size (text-2xl to text-xl) */}
                <div className="grid grid-cols-3 gap-4 p-4 border-b border-gray-200">
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600">92%</div>
                    <div className="text-xs text-gray-600">Home profile</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">$1,240</div>
                    <div className="text-xs text-gray-600">Savings found</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-purple-600">18</div>
                    <div className="text-xs text-gray-600">Home records</div>
                  </div>
                </div>

                {/* Recent Bookings - Reduced padding (p-6 to p-4) and internal padding (p-3 to p-2) */}
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">What&apos;s happening at home</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Spring HVAC service</div>
                          <div className="text-xs text-gray-500">Due in 12 days · Maintenance</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                        Planned
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Roof warranty added</div>
                          <div className="text-xs text-gray-500">Today · Home timeline</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
                        Filed
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
