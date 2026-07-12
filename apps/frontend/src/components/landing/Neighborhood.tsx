import Link from 'next/link';
import { Star } from 'lucide-react';

export default function Neighborhood() {
  return (
    // 1. Reduced padding (py-24 to py-10/12)
    // 2. Changed background (gradient to bg-white) for consistency
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 items-center"> {/* Reduced gap-12 to gap-10 */}
          {/* Left Column - Text Content */}
          <div className="space-y-6"> {/* Reduced space-y-8 to space-y-6 */}
            
            {/* 3. Reduced header font size (text-5xl to text-3xl) */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              The people who know your home
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">The relationship becomes more valuable when the context never disappears.</p>
            
            <div className="space-y-5"> {/* Reduced space-y-6 to space-y-5 */}
              
              {/* Feature 1 */}
              <div className="flex items-start space-x-4">
                {/* 4. Changed icon color (bg-green-500 to bg-blue-600) + Reduced size */}
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white" // Reduced icon size
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  {/* 5. Reduced feature title font size (text-xl to text-lg) */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                    Help in context
                  </h3>
                  {/* 6. Reduced feature description font size (implicit base to text-sm) */}
                  <p className="text-sm text-gray-600">
                    Your roofer knows the roof. Your HVAC technician sees the last service. No one starts without the history.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start space-x-4">
                {/* 4. Changed icon color (bg-green-500 to bg-blue-600) + Reduced size */}
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  {/* 5. Reduced feature title font size (text-xl to text-lg) */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                    Local knowledge
                  </h3>
                  {/* 6. Reduced feature description font size (implicit base to text-sm) */}
                  <p className="text-sm text-gray-600">
                    Trusted relationships and nearby experience remain connected to the home—not buried in a contact list.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-start space-x-4">
                {/* 4. Changed icon color (bg-green-500 to bg-blue-600) + Reduced size */}
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  {/* 5. Reduced feature title font size (text-xl to text-lg) */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                    History preserved
                  </h3>
                  {/* 6. Reduced feature description font size (implicit base to text-sm) */}
                  <p className="text-sm text-gray-600">
                    Reports, estimates, receipts, warranties, and completed work stay attached long after the visit ends.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Provider Card */}
          <div className="relative">
            {/* 7. Reduced card padding (p-8 to p-6) and spacing (space-y-6 to space-y-5) */}
            <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-5">
              {/* Provider Header */}
              <div className="flex items-start justify-between">
                <div>
                  {/* 8. Reduced card title font size (text-2xl to text-xl) */}
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Your home inspection relationship
                  </h3>
                  <div className="flex items-center space-x-2">
                    <div className="flex text-yellow-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <span className="text-sm text-gray-600 font-semibold">4.9</span>
                    <span className="text-sm text-gray-400">Known to your neighborhood</span>
                  </div>
                </div>
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold"> {/* Reduced font size */}
                  Home context ready
                </div>
              </div>

              {/* Neighborhood Stats */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"> {/* Reduced padding */}
                <div className="flex items-center space-x-2 text-blue-900">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-semibold"> {/* Reduced font size */}
                    15 nearby homes · 2 prior visits to your home
                  </span>
                </div>
              </div>

              {/* Service Details */}
              <div className="space-y-2"> {/* Reduced spacing */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Last home visit</span>
                  <span className="font-semibold text-gray-900">May 18, 2025</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Records preserved</span>
                  <span className="font-semibold text-green-600">Report, receipt, photos</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Connected project</span>
                  <span className="font-semibold text-gray-900">Annual inspection</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                {/* 10. Reduced button padding/font size */}
                <button className="px-5 py-2.5 border-2 border-blue-600 text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors">
                  View details
                </button>
                <Link
                  href="/signup"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors text-center"
                >
                  Save to home
                </Link>
              </div>
            </div>

            {/* 11. Changed decorative color (bg-green-200 to bg-blue-200) */}
            <div className="absolute -z-10 top-8 -right-8 w-64 h-64 bg-blue-200 rounded-full opacity-30 blur-3xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
