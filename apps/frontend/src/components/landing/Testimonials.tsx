export default function Testimonials() {
  const testimonials = [
    {
      name: 'Sarah B.',
      location: 'Brooklyn, NY',
      initials: 'SB',
      rating: 5,
      text: 'Saved me $850 and countless headaches! Found my home inspector, locksmith, and cleaning service all in one place. The neighborhood reviews were spot-on.',
    },
    {
      name: 'Michael R.',
      location: 'Park Slope, NY',
      initials: 'MR',
      rating: 5,
      text: 'First-time buyer here. Contract to Cozy made everything so simple. Booked all my services in 20 minutes. The providers were professional and fairly priced.',
    },
    {
      name: 'Jessica C.',
      location: 'Williamsburg, NY',
      initials: 'JC',
      rating: 5,
      text: 'The neighborhood verification is genius! I saw the inspector had done 12 homes on my block. Felt way more confident booking. Smooth process from start to finish.',
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Loved by Homebuyers
          </h2>
          <p className="text-lg md:text-xl text-gray-600">
            Join thousands of happy homeowners
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-8 shadow-md hover:shadow-xl transition-all duration-300"
            >
              {/* Stars */}
              <div className="flex text-yellow-400 text-2xl mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <span key={i}>★</span>
                ))}
              </div>

              {/* Testimonial Text */}
              <p className="text-gray-700 leading-relaxed mb-6 italic">
                "{testimonial.text}"
              </p>

              {/* Author */}
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    {testimonial.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-blue-600 mb-2">10,000+</div>
            <div className="text-gray-600">Happy Homeowners</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600 mb-2">500+</div>
            <div className="text-gray-600">Verified Providers</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600 mb-2">4.9/5</div>
            <div className="text-gray-600">Average Rating</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600 mb-2">$850+</div>
            <div className="text-gray-600">Average Savings</div>
          </div>
        </div>
      </div>
    </section>
  );
}
