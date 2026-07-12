// apps/frontend/src/components/landing/Testimonials.tsx
// Compact version with reduced height
import { Star } from 'lucide-react';
import { landingStyles } from './landingStyles';

export default function Testimonials() {
  const testimonials = [
    {
      name: 'Sarah B.',
      location: 'Brooklyn, NY',
      initials: 'SB',
      rating: 5,
      text: '$900 rebate recovered because our HVAC records were still attached.',
    },
    {
      name: 'Michael R.',
      location: 'Park Slope, NY',
      initials: 'MR',
      rating: 5,
      text: 'Our contractor knew the home history before arriving.',
    },
    {
      name: 'Jessica C.',
      location: 'Williamsburg, NY',
      initials: 'JC',
      rating: 5,
      text: 'We sold with every inspection record ready.',
    },
  ];

  return (
    <section id="testimonials" className={`bg-slate-50 ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        {/* Section Header - Compact */}
        <div className="mb-7 text-left">
          <h2 className={landingStyles.heading}>
            Home knowledge creates real value
          </h2>
        </div>

        {/* Testimonials Grid - Compact */}
        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className={landingStyles.testimonialCard}
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

      </div>
    </section>
  );
}
