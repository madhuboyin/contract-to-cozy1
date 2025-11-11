'use client';

import { useState } from 'react';

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);

  const testimonials = [
    {
      name: 'Sarah Mitchell',
      role: 'Homeowner, Austin TX',
      image: '👩',
      rating: 5,
      text: 'Saved over $1,200 on my home inspection and repairs. The process was incredibly smooth and all providers were professional.',
    },
    {
      name: 'Michael Chen',
      role: 'First-time Buyer',
      image: '👨',
      rating: 5,
      text: 'As a first-time homebuyer, I was overwhelmed. Contract to Cozy made everything simple and stress-free. Highly recommend!',
    },
    {
      name: 'Jennifer Lopez',
      role: 'Real Estate Agent',
      image: '👩‍💼',
      rating: 5,
      text: 'I recommend this platform to all my clients. The verified professionals and transparent pricing give everyone peace of mind.',
    },
  ];

  return (
    <section className="py-12 bg-gradient-to-br from-teal-50 to-primary-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Loved by Homeowners
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Join thousands of happy customers
          </p>
        </div>

        {/* Testimonial Carousel */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-teal-100">
            {/* Stars */}
            <div className="flex justify-center mb-4">
              {[...Array(testimonials[activeIndex].rating)].map((_, i) => (
                <span key={i} className="text-yellow-400 text-2xl">★</span>
              ))}
            </div>

            {/* Quote */}
            <p className="text-lg text-gray-700 text-center mb-6 leading-relaxed italic">
              "{testimonials[activeIndex].text}"
            </p>

            {/* Author */}
            <div className="flex items-center justify-center">
              <div className="text-4xl mr-3">{testimonials[activeIndex].image}</div>
              <div>
                <div className="font-bold text-gray-900">{testimonials[activeIndex].name}</div>
                <div className="text-sm text-gray-500">{testimonials[activeIndex].role}</div>
              </div>
            </div>

            {/* Navigation Dots */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === activeIndex ? 'bg-teal-600 w-6' : 'bg-gray-300'
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-10 flex flex-wrap justify-center items-center gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-600">10,000+</div>
            <div className="text-sm text-gray-600">Happy Customers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-600">500+</div>
            <div className="text-sm text-gray-600">Verified Providers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-600">50,000+</div>
            <div className="text-sm text-gray-600">Services Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-600">4.9/5</div>
            <div className="text-sm text-gray-600">Average Rating</div>
          </div>
        </div>
      </div>
    </section>
  );
}
