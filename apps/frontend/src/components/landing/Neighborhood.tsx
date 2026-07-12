import Link from 'next/link';
import { Star } from 'lucide-react';
import { landingStyles } from './landingStyles';

export default function Neighborhood() {
  return (
    // 1. Reduced padding (py-24 to py-10/12)
    // 2. Changed background (gradient to bg-white) for consistency
    <section className={`bg-white ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
          {/* Left Column - Text Content */}
          <div className="space-y-6"> {/* Reduced space-y-8 to space-y-6 */}
            
            {/* 3. Reduced header font size (text-5xl to text-3xl) */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              The people who know your home
            </h2>
            
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
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Provider Card */}
          <div className="relative">
            {/* 7. Reduced card padding (p-8 to p-6) and spacing (space-y-6 to space-y-5) */}
            <div className={`${landingStyles.productCard} space-y-5 p-6`}>
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
                <button className="min-h-[44px] rounded-xl border border-brand-300 px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                  View details
                </button>
                <Link
                  href="/signup"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
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
