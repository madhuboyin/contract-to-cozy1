// apps/frontend/src/components/landing/CTASection.tsx
// Updated with sleek/compact styling, smaller fonts, and tighter spacing

import Link from 'next/link';

export default function CTASection() {
  return (
    // 1. Reduced vertical padding
    <section className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-500 to-indigo-600">
      <div className="max-w-4xl mx-auto text-center">
        {/* 2. Reduced header font size and margin */}
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
          Ready to Get Started?
        </h2>
        {/* 3. Reduced subtitle font size and margin */}
        <p className="text-lg text-blue-100 mb-6 max-w-2xl mx-auto">
          Join thousands of homeowners who trust Contract to Cozy for all their home service needs
        </p>
        
        {/* 4. Reduced button padding */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-6 py-3 bg-white text-blue-600 text-base font-semibold rounded-lg hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl"
          >
            Create Free Account
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 bg-blue-700 text-white text-base font-semibold rounded-lg hover:bg-blue-800 transition-all border-2 border-white/20"
          >
            Browse Services
          </Link>
        </div>

        {/* 5. Reduced top margin/padding and increased border opacity */}
        <div className="mt-10 pt-6 border-t border-blue-400/50">
          <div className="flex flex-wrap justify-center items-center gap-8 text-blue-100">
            <div className="flex items-center">
              <span className="text-2xl mr-2">✓</span>
              <span className="text-sm">No credit card required</span>
            </div>
            <div className="flex items-center">
              <span className="text-2xl mr-2">✓</span>
              <span className="text-sm">Free to browse</span>
            </div>
            <div className="flex items-center">
              <span className="text-2xl mr-2">✓</span>
              <span className="text-sm">Cancel anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}