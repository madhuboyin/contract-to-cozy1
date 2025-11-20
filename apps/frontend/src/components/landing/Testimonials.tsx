// src/components/landing/Testimonials.tsx (Prop-based final version)

import React from 'react';
import { Quote, Star } from 'lucide-react';
import { UserType } from '@/types';

interface TestimonialsProps {
  userType: UserType;
}

export const Testimonials: React.FC<TestimonialsProps> = ({ userType }) => {
  const bgClass = userType === UserType.BUYER ? "bg-stone-900" : "bg-amber-50";
  const textClass = userType === UserType.BUYER ? "text-white" : "text-stone-900";
  const subTextClass = userType === UserType.BUYER ? "text-stone-400" : "text-stone-500";
  const cardBg = userType === UserType.BUYER ? "bg-stone-800" : "bg-white";
  
  const reviews = userType === UserType.BUYER ? [
    {
      text: "Contract to Cozy found a clause in the inspection report I completely missed. Saved us $3,000 on HVAC repairs before we even signed.",
      author: "Sarah J.",
      role: "First-time Buyer",
      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1887&auto=format&fit=crop"
    },
    {
      text: "The moving checklist was a lifesaver. I usually forget utility transfers, but Cozy handled it all. Walked into a warm house with WiFi!",
      author: "Michael T.",
      role: "Relocation Buyer",
      image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1887&auto=format&fit=crop" 
    },
  ] : [
    {
      text: "The maintenance reminders are a game-changer. I finally feel proactive about my home instead of constantly putting out fires.",
      author: "David M.",
      role: "Long-term Homeowner",
      image: "https://images.unsplash.com/photo-1507003211169-0a812d80f828?q=80&w=1887&auto=format&fit=crop" 
    },
    {
      text: "Found a five-star plumber instantly using their vetted directory. The transparency in pricing was a huge relief.",
      author: "Jessica L.",
      role: "Property Manager",
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1884&auto=format&fit=crop" 
    },
  ];

  if (userType === UserType.GUEST) return null;

  return (
    <section className={`py-20 md:py-32 ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <span className={`font-bold tracking-widest uppercase text-sm ${userType === UserType.BUYER ? 'text-amber-500' : 'text-stone-700'}`}>TESTIMONIALS</span>
            <h2 className={`text-4xl md:text-5xl font-serif font-bold mt-3 ${textClass}`}>
              Living the Cozy Life.
            </h2>
          </div>
          <div className="flex text-amber-500 space-x-1 mt-4 md:mt-0">
             {[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-current" />)}
             <span className={`ml-2 text-sm font-medium ${subTextClass}`}>4.9/5 from 2,000+ users</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {reviews.map((review, idx) => (
            <div key={idx} className={`${cardBg} p-8 rounded-3xl relative group hover:-translate-y-1 transition-transform duration-300`}>
              <Quote className={`w-10 h-10 ${userType === UserType.BUYER ? 'text-stone-700' : 'text-amber-100'} absolute top-8 right-8`} />
              <p className={`text-lg leading-relaxed mb-8 relative z-10 ${userType === UserType.BUYER ? 'text-stone-200' : 'text-stone-600'}`}>
                "{review.text}"
              </p>
              <div className="flex items-center">
                <img src={review.image} alt={review.author} className="w-12 h-12 rounded-full object-cover mr-4 ring-2 ring-amber-500/50" />
                <div>
                  <div className={`font-semibold text-lg ${userType === UserType.BUYER ? 'text-white' : 'text-stone-900'}`}>{review.author}</div>
                  <div className={`text-sm ${userType === UserType.BUYER ? 'text-stone-400' : 'text-stone-600'}`}>{review.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};