// apps/frontend/src/app/page.tsx
'use client'; 

import React, { useState, useEffect } from 'react';
import PreviewModeWrapper from '@/components/PreviewModeWrapper';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Testimonials } from '@/components/landing/Testimonials';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';
import { AIChat } from '@/components/AIChat';
// Assuming UserType is exported from your main types file
import { UserType } from '@/types'; 


export default function Home() {
    // 1. Centralize State Management (Prop-Drilling architecture)
    const [activeUserType, setActiveUserType] = useState<UserType>(UserType.GUEST);

    // 2. Scroll to top on user type switch (for smooth navigation)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [activeUserType]);

    
    const landingPage = (
        // Apply base styles from the new design (assuming they aren't fully handled by globals.css)
        <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-amber-200 flex flex-col">
            {/* Navbar receives state and setter */}
            <Navbar 
                activeUserType={activeUserType} 
                setActiveUserType={setActiveUserType} 
            /> 
            
            <main className="flex-grow">
                {/* Hero receives state and setter */}
                <Hero 
                    userType={activeUserType} 
                    setUserType={setActiveUserType} 
                />
                
                {/* Features receives state */}
                <Features 
                    userType={activeUserType} 
                />
                
                {/* Testimonials receives state (conditionally rendered inside component) */}
                {activeUserType !== UserType.GUEST && (
                    <Testimonials userType={activeUserType} />
                )}
            </main>

            {/* AIChat receives state */}
            <AIChat userType={activeUserType} /> 
            
            <Footer />
        </div>
    );

    return (
        <PreviewModeWrapper>
            {landingPage}
        </PreviewModeWrapper>
    );
}