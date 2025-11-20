// src/components/landing/Features.tsx

import React from 'react';
import Image from 'next/image';
import { UserType, ClosingMilestone } from '@/types'; 
import { 
  Shield, 
  Wrench, 
  Calendar, 
  TrendingUp,
  CheckCircle2,
  ListChecks,
  Home,
  Zap, 
  FileText 
} from 'lucide-react';

// Simplified Card for the Buyer/Owner flow
const MilestoneCard: React.FC<ClosingMilestone> = ({ title, description, icon }) => (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-stone-100 hover:shadow-xl transition-shadow duration-300">
        <div className="text-amber-700 mb-4">{icon}</div>
        <h3 className="text-xl font-serif font-semibold text-stone-900 mb-2">{title}</h3>
        <p className="text-sm text-stone-600">{description}</p>
    </div>
);

interface FeaturesProps {
  userType: UserType;
}

export const Features: React.FC<FeaturesProps> = ({ userType }) => {
    // Data structures for the 4 sections... (omitted for brevity)
    
    // Data for BUYER State - Group 1: Due Diligence
    const buyerDueDiligence: ClosingMilestone[] = [
        {
            id: 1,
            title: "Inspection Management",
            description: "Coordinate home, pest, and specialty inspections in one place. Receive reports directly in your dashboard.",
            icon: <ListChecks className="w-6 h-6" />
        },
        {
            id: 2,
            title: "Document Vault",
            description: "Securely store your purchase agreement, title report, and inspection documents. Access them anytime, anywhere.",
            icon: <FileText className="w-6 h-6" />
        }
    ];
    
    // Data for BUYER State - Group 2: Logistics & Utility
    const buyerLogistics: ClosingMilestone[] = [
        {
            id: 3,
            title: "Service Pro Coordination",
            description: "Seamlessly book final walk-through repairs, locksmiths, and deep cleaning services before your move-in date.",
            icon: <Wrench className="w-6 h-6" />
        },
        {
            id: 4,
            title: "Utility & Budget Tracking",
            description: "Monitor escrow payments, closing costs, and get estimates for immediate post-close expenses and utility transfers.",
            icon: <Zap className="w-6 h-6" />
        }
    ];

    // Data for OWNER State - Group 1: Proactive Care
    const ownerProactiveCare: ClosingMilestone[] = [
        {
            id: 1,
            title: "Personalized Maintenance Schedule",
            description: "Get smart, seasonal reminders for tasks like gutter cleaning, HVAC filter changes, and pest control based on your home’s systems.",
            icon: <Calendar className="w-6 h-6" />
        },
        {
            id: 2,
            title: "Repair Budget Tracker",
            description: "Log all repair and maintenance spending to see your home’s true cost of ownership and track against your annual budget.",
            icon: <TrendingUp className="w-6 h-6" />
        }
    ];

    // Data for OWNER State - Group 2: Trusted Pros
    const ownerTrustedPros: ClosingMilestone[] = [
        {
            id: 3,
            title: "Vetted Local Pros",
            description: "Access our curated directory of local service providers, trusted and rated by homeowners in your community.",
            icon: <Shield className="w-6 h-6" />
        },
        {
            id: 4,
            title: "Home History Record",
            description: "Automatically log all service dates and document home improvements to maximize resale value.",
            icon: <Home className="w-6 h-6" />
        }
    ];
    
    // Combine data into structures for mapping with titles
    const buyerSections = [
        { title: 'DUE DILIGENCE - SEE WHAT OTHERS MISS', milestones: buyerDueDiligence },
        { title: 'LOGISTICS & UTILITY - ARRIVE TO A RUNNING HOME', milestones: buyerLogistics },
    ];
    
    const ownerSections = [
        { title: 'PROACTIVE CARE - PREVENT EXPENSIVE SURPRISES', milestones: ownerProactiveCare },
        { title: 'TRUSTED PROS - EXPERT HELP, ONE TAP AWAY', milestones: ownerTrustedPros },
    ];
    
    if (userType === UserType.GUEST) return null; // Hide features for Guest state

    const isBuyer = userType === UserType.BUYER;
    const currentSections = isBuyer ? buyerSections : ownerSections;
    
    // Feature image data (using new stable URLs)
    const featureData = isBuyer ? {
        subtitle: "The Closing Roadmap",
        title: "From Offer to Keys, Simplified.",
        description: "We organize the chaotic weeks before closing into a streamlined, manageable checklist. Never miss a deadline or forget a utility transfer again.",
        features: [
            "Real-time task synchronization across all parties.",
            "Integrated scheduling with local inspectors.",
            "Secure, encrypted document storage.",
            "Alerts for critical contract deadlines."
        ],
        // Asset: Story: Inspection
        image: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=2070&auto=format&fit=crop", 
        
    } : {
        subtitle: "The Cozy Life",
        title: "Home Management, Mastered.",
        description: "Stop reacting to emergencies. Our platform helps you proactively manage your home systems, ensuring longevity and saving you money on costly, unexpected repairs.",
        features: [
            "AI-powered maintenance suggestions.",
            "One-click re-booking of trusted providers.",
            "Detailed cost of ownership reports.",
            "Automated annual service reminders."
        ],
        // Asset: Story: Maintenance
        image: "https://images.unsplash.com/photo-1505798577917-a65157d3320a?q=80&w=2070&auto=format&fit=crop", 
    };

    return (
      <div className="bg-stone-50 overflow-hidden py-20">
        {/* Intro Grid Section - Now segmented */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <div className="text-center mb-12">
            <span className="text-amber-700 font-bold tracking-widest uppercase text-sm">{featureData.subtitle}</span>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-stone-900 mt-3">{featureData.title}</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {currentSections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="space-y-6">
                    {/* Section Title Header for prominence */}
                    <h3 className="text-base font-bold text-stone-900 border-b border-amber-200 pb-2 uppercase tracking-wide">
                        {section.title}
                    </h3>
                    {/* FIX: Using sm:grid-cols-2 for horizontal alignment of cards */}
                    <div className="grid sm:grid-cols-2 gap-6"> 
                        {section.milestones.map(m => (
                            <MilestoneCard key={m.id} {...m} />
                        ))}
                    </div>
                </div>
            ))}
          </div>
        </section>
        
        {/* Detail Feature Section */}
        <section className="py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={`flex flex-col lg:flex-row gap-12 items-center ${isBuyer ? '' : 'lg:flex-row-reverse'}`}>
                {/* Image Side */}
                <div className="w-full lg:w-1/2 relative group">
                    <div className={`absolute inset-0 bg-amber-200 rounded-3xl transform transition-transform duration-500 ${isBuyer ? 'rotate-3 group-hover:rotate-6' : '-rotate-3 group-hover:-rotate-6'}`} />
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/3]">
                         {/* Placeholder for the image */}
                        <Image 
                            src={featureData.image} 
                            alt={featureData.title} 
                            fill 
                            style={{ objectFit: 'cover' }}
                            className="transform transition-transform duration-700 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-stone-900/10 group-hover:bg-transparent transition-colors" />
                    </div>
                </div>

                {/* Content Side */}
                <div className="w-full lg:w-1/2">
                    <span className="text-amber-700 font-bold tracking-widest uppercase text-sm mb-2 block">{isBuyer ? 'Key Benefits' : 'Proactive Management'}</span>
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-stone-900 mb-6 leading-tight">Why Choose Contract to Cozy?</h2>
                    <p className="text-lg text-stone-600 mb-8 leading-relaxed">
                        {featureData.description}
                    </p>
                    
                    <div className="space-y-4">
                        {featureData.features.map((feature, idx) => (
                            <div key={idx} className="flex items-center">
                                <CheckCircle2 className="w-5 h-5 text-amber-700 mr-3 flex-shrink-0" />
                                <span className="text-stone-700 font-medium">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
      </div>
    );
};