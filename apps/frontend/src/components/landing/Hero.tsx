// apps/frontend/src/components/landing/Hero.tsx
// Compact version - Angi.com style with reduced height

'use client';

import Link from 'next/link';
import { useState } from 'react';

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
    <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 overflow-hidden">
      {/* Subtle decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-purple-100 rounded-full opacity-20 blur-3xl"></div>
      </div>

      {/* Navigation */}
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

      {/* Hero Content - COMPACT VERSION */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left Column - Content */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium mb-4">
                <span className="mr-1.5">✨</span>
                Trusted by 10,000+ homeowners
              </div>

              {/* Headline - Compact */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Home Services Made
                <span className="block text-blue-600 mt-1">Simple & Affordable</span>
              </h1>

              {/* Subtitle */}
              <p className="text-base md:text-lg text-gray-600 mb-6 leading-relaxed">
                Connect with trusted local professionals for inspections, repairs, and upgrades. 
                Save time and money on every home service.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-6">
                <Link
                  href="/signup"
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/providers/join"
                  className="px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all border border-gray-200 shadow-sm"
                >
                  I'm a Provider
                </Link>
              </div>

              {/* Stats - Compact */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
                <div className="text-center lg:text-left">
                  <div className="text-xl md:text-2xl font-bold text-blue-600">$850</div>
                  <div className="text-xs text-gray-500 mt-0.5">Avg Savings</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl md:text-2xl font-bold text-blue-600">15hrs</div>
                  <div className="text-xs text-gray-500 mt-0.5">Time Saved</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl md:text-2xl font-bold text-blue-600">98%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Happy Clients</div>
                </div>
              </div>
            </div>

            {/* Right Column - Illustration/Image */}
            <div className="hidden lg:block">
              <div className="relative">
                <div className="aspect-square bg-white rounded-2xl border border-gray-200 shadow-lg flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🏡</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Your Home Journey</h3>
                    <p className="text-sm text-gray-600 mb-6">Simplified & Stress-Free</p>
                    
                    {/* Feature badges - compact */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-center text-sm text-gray-700">
                        <span className="mr-2 text-green-600">✓</span>
                        Verified Professionals
                      </div>
                      <div className="flex items-center justify-center text-sm text-gray-700">
                        <span className="mr-2 text-green-600">✓</span>
                        Transparent Pricing
                      </div>
                      <div className="flex items-center justify-center text-sm text-gray-700">
                        <span className="mr-2 text-green-600">✓</span>
                        Book in Minutes
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
