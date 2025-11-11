'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Hero() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-teal-50 via-white to-primary-50 min-h-[60vh]">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <span className="text-2xl">🏡</span>
                <span className="text-xl font-bold text-gray-900">Contract to Cozy</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollToSection('features')}
                className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
              >
                How It Works
              </button>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-coral-500 text-white text-sm font-medium rounded-lg hover:bg-coral-600 transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {isMenuOpen && (
            <div className="md:hidden py-4 space-y-2 border-t border-gray-200">
              <button
                onClick={() => scrollToSection('features')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-teal-600 py-2"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-teal-600 py-2"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="block w-full text-left text-sm font-medium text-gray-600 hover:text-teal-600 py-2"
              >
                How It Works
              </button>
              <Link
                href="/login"
                className="block text-sm font-medium text-gray-600 hover:text-teal-600 py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="block px-4 py-2 bg-coral-500 text-white text-sm font-medium rounded-lg text-center hover:bg-coral-600 mt-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium mb-6">
            <span className="mr-1.5">✨</span>
            Trusted by 10,000+ homeowners
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Home Services Made
            <span className="block text-teal-600 mt-2">Simple & Affordable</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
            Connect with verified local professionals for inspections, repairs, and upgrades. 
            Save time and money on every home service.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              href="/signup"
              className="px-6 py-3 bg-coral-500 text-white text-base font-medium rounded-lg hover:bg-coral-600 transition-all shadow-md hover:shadow-lg"
            >
              Get Started Free
            </Link>
            <Link
              href="/providers/join"
              className="px-6 py-3 bg-white text-gray-700 text-base font-medium rounded-lg hover:bg-gray-50 transition-all border-2 border-gray-200 shadow-sm"
            >
              I'm a Provider
            </Link>
          </div>

          {/* Stats - Inline */}
          <div className="flex justify-center gap-8 pt-6 border-t border-gray-200 max-w-xl mx-auto">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-teal-600">$850</div>
              <div className="text-xs text-gray-500 mt-1">Avg Savings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-teal-600">15hrs</div>
              <div className="text-xs text-gray-500 mt-1">Time Saved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-teal-600">98%</div>
              <div className="text-xs text-gray-500 mt-1">Happy Clients</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
