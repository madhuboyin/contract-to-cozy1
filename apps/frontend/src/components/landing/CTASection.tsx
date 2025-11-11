import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="py-16 bg-gradient-to-br from-teal-600 to-primary-600 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-lg text-teal-100 mb-8 max-w-2xl mx-auto">
          Join thousands of homeowners who are saving time and money on home services
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 bg-coral-500 text-white text-base font-medium rounded-lg hover:bg-coral-600 transition-all shadow-lg hover:shadow-xl"
          >
            Sign Up Free
          </Link>
          <Link
            href="/providers/join"
            className="px-8 py-3 bg-white text-teal-600 text-base font-medium rounded-lg hover:bg-gray-50 transition-all shadow-lg"
          >
            Become a Provider
          </Link>
        </div>
        <p className="mt-6 text-sm text-teal-100">
          No credit card required • Free to join • Cancel anytime
        </p>
      </div>
    </section>
  );
}
