// apps/frontend/src/components/landing/Testimonials.tsx
// Compact version with reduced height

export default function Testimonials() {
  const testimonials = [
    {
      name: 'Sarah B.',
      location: 'Brooklyn, NY',
      initials: 'SB',
      rating: 5,
      text: 'Saved me $850 and countless headaches! Found my home inspector, locksmith, and cleaning service all in one place.',
    },
    {
      name: 'Michael R.',
      location: 'Park Slope, NY',
      initials: 'MR',
      rating: 5,
      text: 'First-time buyer here. Contract to Cozy made everything so simple. Booked all my services in 20 minutes.',
    },
    {
      name: 'Jessica C.',
      location: 'Williamsburg, NY',
      initials: 'JC',
      rating: 5,
      text: 'The neighborhood verification is genius! I saw the inspector had done 12 homes on my block. Felt way more confident.',
    },
  ];

  return (
    <section className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header - Compact */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Loved by Homebuyers
          </h2>
          <p className="text-base text-gray-600">
            Join thousands of happy homeowners
          </p>
        </div>

        {/* Testimonials Grid - Compact */}
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300"
            >
              {/* Stars - Smaller */}
              <div className="flex text-yellow-400 text-lg mb-3">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <span key={i}>★</span>
                ))}
              </div>

              {/* Testimonial Text - Compact */}
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                "{testimonial.text}"
              </p>

              {/* Author - Compact */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {testimonial.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {testimonial.name}
                  </div>
                  <div className="text-xs text-gray-600">
                    {testimonial.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badges - Compact */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">10,000+</div>
            <div className="text-xs text-gray-600">Happy Homeowners</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">500+</div>
            <div className="text-xs text-gray-600">Verified Providers</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">4.9/5</div>
            <div className="text-xs text-gray-600">Average Rating</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">$850+</div>
            <div className="text-xs text-gray-600">Average Savings</div>
          </div>
        </div>
      </div>
    </section>
  );
}
