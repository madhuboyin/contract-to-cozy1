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
    <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2 text-xl font-bold text-blue-600">
              <span className="text-2xl">🏠</span>
              <span>Contract to Cozy</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollToSection('features')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('calculator')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                Calculator
              </button>
              <Link
                href="/login"
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Sign Up
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {isMenuOpen && (
            <div className="md:hidden pb-4 space-y-2">
              <button
                onClick={() => scrollToSection('features')}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection('calculator')}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Calculator
              </button>
              <Link
                href="/login"
                className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="block px-4 py-2 bg-blue-600 text-white rounded-md text-center hover:bg-blue-700"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Content */}
      <div className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Text Content */}
            <div className="text-white space-y-8">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                From Offer to Move-In in Minutes
              </h1>
              <p className="text-lg md:text-xl text-blue-100 leading-relaxed">
                Skip the stress. Save thousands. Book vetted home inspectors, handymen, 
                and service providers your neighbors trust—all in one place.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-blue-600 bg-white rounded-lg hover:bg-gray-50 transition-colors shadow-lg"
                >
                  Start Your Journey
                  <svg
                    className="ml-2 w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white border-2 border-white rounded-lg hover:bg-white hover:text-blue-600 transition-colors"
                >
                  See How It Works
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8">
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-yellow-300">$850+</div>
                  <div className="text-sm md:text-base text-blue-100 mt-2">Average Saved</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-yellow-300">15hrs</div>
                  <div className="text-sm md:text-base text-blue-100 mt-2">Time Saved</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-yellow-300">98%</div>
                  <div className="text-sm md:text-base text-blue-100 mt-2">Happy Customers</div>
                </div>
              </div>
            </div>

            {/* Right Column - Animated Mockup */}
            <div className="relative hidden lg:block">
              <div className="relative z-10 animate-float">
                <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
                  {/* Mock UI */}
                  <div className="flex items-center space-x-3 pb-4 border-b">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">
                      🏠
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Brooklyn Home Inspectors</div>
                      <div className="flex items-center text-sm text-gray-600">
                        <span className="text-yellow-400">★★★★★</span>
                        <span className="ml-2">4.9 (127 reviews)</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Service Type</span>
                      <span className="font-semibold text-gray-900">Home Inspection</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Price</span>
                      <span className="font-semibold text-green-600">$425</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Availability</span>
                      <span className="font-semibold text-gray-900">Next 2 days</span>
                    </div>
                  </div>
                  <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Book Now
                  </button>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    <strong>Best Value</strong> • 15 jobs in your neighborhood
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute top-10 -left-10 w-32 h-32 bg-blue-400 rounded-full opacity-20 blur-2xl"></div>
              <div className="absolute bottom-10 -right-10 w-40 h-40 bg-purple-400 rounded-full opacity-20 blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Add floating animation */}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
