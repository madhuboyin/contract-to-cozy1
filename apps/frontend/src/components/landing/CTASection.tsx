// apps/frontend/src/components/landing/CTASection.tsx
// Updated with lighter colors and smaller fonts

import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-500 to-indigo-600">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-lg md:text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Join thousands of homeowners who trust Contract to Cozy for all their home service needs
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-4 bg-white text-blue-600 text-base font-semibold rounded-lg hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl"
          >
            Create Free Account
          </Link>
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-700 text-white text-base font-semibold rounded-lg hover:bg-blue-800 transition-all border-2 border-white/20"
          >
            Browse Services
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="mt-12 pt-8 border-t border-blue-400/30">
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
