// apps/frontend/src/components/landing/Hero.tsx
// Angi.com-inspired Hero - With "Get Started Free" button, no search box

'use client';

import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';

export default function Hero() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="relative w-full overflow-hidden bg-white">
      {/* Navigation (Kept as is) */}
      <nav className="relative z-50 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl">🏠</span>
              <span className="text-lg font-semibold text-gray-900">Contract to Cozy</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <Link
                href="/providers/join"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                For Providers
              </Link>
              <button
                onClick={() => scrollToSection('features')}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('calculator')}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Savings
              </button>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Sign Up
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-4 py-6 space-y-4">
              <Link
                href="/providers/join"
                className="block text-sm font-medium text-gray-600 hover:text-blue-600"
                onClick={() => setIsMenuOpen(false)}
              >
                For Providers
              </Link>
              <button
                onClick={() => scrollToSection('features')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-blue-600"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-blue-600"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-blue-600"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('calculator')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-blue-600"
              >
                Savings
              </button>
              <Link
                href="/login"
                className="block text-sm font-medium text-gray-600 hover:text-blue-600"
                onClick={() => setIsMenuOpen(false)}
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg text-center hover:bg-blue-700"
                onClick={() => setIsMenuOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Content - Angi.com Style - MINIMAL HEIGHT */}
      <div className="relative h-[380px] md:h-[450px] flex items-center justify-center text-center px-4">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/contract-to-cozy-dashboard.png" // Your downloaded image
            alt="Contract to Cozy Dashboard Background"
            fill
            style={{ objectFit: 'cover' }}
            priority
            className="opacity-50 md:opacity-70"
          />
          {/* STRONGER OVERLAY for significantly better text readability */}
          <div className="absolute inset-0 bg-blue-900 opacity-60"></div> 
        </div>

        {/* Text and CTA Overlay */}
        <div className="relative z-10 max-w-3xl text-white">
          {/* Badge - Tighter margin */}
          <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-white bg-opacity-30 text-white text-xs font-medium mb-2"> 
            <span className="mr-1.5">✨</span>
            Trusted by 10,000+ homeowners
          </div>

          {/* Headline - Tighter margin */}
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-2 drop-shadow-lg text-white"> 
              Home Services Made <span className="text-blue-300">Simple & Affordable</span>
          </h1>

          {/* Subtitle - Tighter margin */}
          <p className="text-base md:text-lg mb-6 leading-relaxed drop-shadow-md text-white"> {/* Increased mb- to center the single button better */}
            Connect with trusted local professionals for inspections, repairs, and upgrades. 
            Save time and money on every home service.
          </p>

          {/* CTA: "Get Started Free" Button (Single CTA) */}
          <div className="flex justify-center mb-6"> 
            <Link
              href="/signup" // Link to your signup page
              className="px-8 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
            >
              Get Started Free
            </Link>
          </div>

          {/* Stats - Tighter padding */}
          <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto pt-3 border-t border-white border-opacity-40"> 
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-blue-300">$850</div>
              <div className="text-xs text-white text-opacity-100 mt-0.5">Avg Savings</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-blue-300">15hrs</div>
              <div className="text-xs text-white text-opacity-100 mt-0.5">Time Saved</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-blue-300">98%</div>
              <div className="text-xs text-white text-opacity-100 mt-0.5">Happy Clients</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}