// apps/frontend/src/components/landing/Testimonials.tsx
// Compact version with reduced height
import { Star } from 'lucide-react';

export default function Testimonials() {
  const testimonials = [
    {
      name: 'Sarah B.',
      location: 'Brooklyn, NY',
      initials: 'SB',
      rating: 5,
      text: 'For the first time, I know exactly where every document, warranty, and repair record lives. The mental load is gone.',
    },
    {
      name: 'Michael R.',
      location: 'Park Slope, NY',
      initials: 'MR',
      rating: 5,
      text: 'I no longer wonder what maintenance I forgot. I can see what is coming and plan for it before it becomes urgent.',
    },
    {
      name: 'Jessica C.',
      location: 'Williamsburg, NY',
      initials: 'JC',
      rating: 5,
      text: 'When we prepared to sell, our complete home history was already organized. What used to feel daunting felt manageable.',
    },
  ];

  return (
    <section id="testimonials" className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Header - Compact */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            A calmer way to own a home
          </h2>
          <p className="text-base text-gray-600">
            Confidence comes from knowing everything is in its place.
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
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>

              {/* Testimonial Text - Compact */}
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                &quot;{testimonial.text}&quot;
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
            <div className="text-2xl font-bold text-blue-600 mb-1">One place</div>
            <div className="text-xs text-gray-600">Home records organized</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">One history</div>
            <div className="text-xs text-gray-600">Homes kept connected</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">Always ready</div>
            <div className="text-xs text-gray-600">Homeowner confidence</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 mb-1">Built for years</div>
            <div className="text-xs text-gray-600">Savings opportunities</div>
          </div>
        </div>
      </div>
    </section>
  );
}
