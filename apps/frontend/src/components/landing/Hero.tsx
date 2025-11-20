// apps/frontend/src/components/landing/Hero.tsx

import React from 'react';
import Image from 'next/image';
import { ArrowRight, Key, ShieldCheck } from 'lucide-react';
import { UserType } from '@/types'; 
// NOTE: Assuming useAuth is correctly imported from your AuthContext file.
import { useAuth } from '@/lib/auth/AuthContext'; 

interface HeroProps {
  userType: UserType;
  setUserType: (type: UserType) => void;
}

// Defining the ContentMap type
type ContentMap = {
    [key in UserType]: {
        image: string;
        title: string;
        subtitle: string;
        buttonText: string | null;
        accent: string | undefined;
        link: string | null;
    }
}

export const Hero: React.FC<HeroProps> = ({ userType, setUserType }) => {
  const { isAuthenticated } = useAuth(); // Get authentication state

  // Define the target paths for redirection
  const BUYER_DESTINATION = '/dashboard/checklist';
  const OWNER_DESTINATION = '/dashboard/page'; 

  // Function to create the conditional link
  const getCtaLink = (destination: string): string => {
    return isAuthenticated 
      ? destination 
      : `/login?redirect=${destination}`;
  };

  const content: ContentMap = { 
    [UserType.GUEST]: {
      image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop", 
      title: "From Contract to Cozy",
      subtitle: "Your complete companion for the home journey—simplifying the chaos of closing and mastering the art of maintenance.",
      buttonText: null,
      accent: undefined,
      link: null,
    },
    [UserType.BUYER]: {
      image: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?q=80&w=2070&auto=format&fit=crop", 
      title: "Close with Confidence",
      subtitle: "Navigate inspections, insurance, and the final move without the stress. We guide you from signed offer to front door keys.",
      buttonText: "Start Your Closing Checklist",
      accent: "bg-stone-900 hover:bg-stone-800",
      link: getCtaLink(BUYER_DESTINATION), // Conditional Link Applied
    },
    [UserType.OWNER]: {
      image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop", 
      title: "Master Your Home Maintenance",
      subtitle: "Stop guessing about repairs. We provide personalized reminders, vetted local pros, and budget tracking for every major system in your home.",
      buttonText: "Set Up My Maintenance Plan",
      accent: "bg-amber-700 hover:bg-amber-600",
      link: getCtaLink(OWNER_DESTINATION), // Conditional Link Applied
    },
  };

  const current = content[userType] || content[UserType.GUEST];
  
  const isGuest = userType === UserType.GUEST;
  const bgImage = current.image;
  
  const headlineColor = 'text-white';
  const subtextColor = 'text-stone-200';
  const overlayClass = isGuest ? 'bg-stone-900/60' : 'bg-stone-900/40'; 
  
  return (
    <div className="relative w-full overflow-hidden min-h-[600px] flex items-center">
      {/* Background Image/Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src={bgImage}
          alt={`Background for ${current.title}`}
          fill
          style={{ objectFit: 'cover' }}
          priority
          className={`${isGuest ? 'opacity-90' : 'opacity-100'}`}
        />
        <div className={`absolute inset-0 transition-colors duration-500 ${overlayClass}`}></div>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className={`max-w-3xl ${isGuest ? 'text-center mx-auto' : 'text-left'}`}> 
          
          <h1 className={`text-5xl md:text-6xl lg:text-7xl font-serif font-bold leading-tight mb-4 transition-colors duration-300 drop-shadow-lg ${headlineColor}`}> 
            {current.title}
          </h1>

          <p className={`text-lg md:text-xl mb-10 leading-relaxed transition-colors duration-300 drop-shadow-md ${subtextColor}`}>
            {current.subtitle}
          </p>

          {isGuest ? (
            /* Guest State: Show the two primary buttons to select user type */
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <button 
                onClick={() => setUserType(UserType.BUYER)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left bg-stone-900/80 backdrop-blur-sm border border-stone-700 hover:bg-stone-800 transition-all duration-300 hover:-translate-y-1 shadow-xl"
              >
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                  <Key className="w-16 h-16 text-stone-100" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-white mb-2">I'm a Buyer</h3>
                <p className="text-stone-300 text-sm">Need help with inspections, closing documents, and moving logistics.</p>
                <div className="mt-4 flex items-center text-amber-500 font-medium">
                  Start My Journey <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              <button 
                onClick={() => setUserType(UserType.OWNER)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left bg-amber-900/40 backdrop-blur-md border border-amber-500/30 hover:bg-amber-900/60 transition-all duration-300 hover:-translate-y-1"
              >
                 <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ShieldCheck className="w-16 h-16 text-amber-200" />
                </div>
                <h3 className="text-2xl font-serif font-semibold text-white mb-2">I'm an Owner</h3>
                <p className="text-stone-300 text-sm">Home is closed. Need help with maintenance, repairs, and upgrades.</p>
                <div className="mt-4 flex items-center text-amber-400 font-medium">
                  Manage My Home <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          ) : (
            /* Buyer/Owner State: Show the primary CTA */
            current.link && ( 
              <a
                href={current.link} 
                className={`px-8 py-4 rounded-full text-white font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 flex items-center ${current.accent || 'bg-stone-900'}`}
              >
                {current.buttonText}
                <ArrowRight className="w-5 h-5 ml-3" />
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
};