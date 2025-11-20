// src/components/landing/Navbar.tsx (Prop-based final version)

import React from 'react';
import { Home, Key, ShieldCheck, User } from 'lucide-react';
import { UserType } from '@/types';

interface NavbarProps {
  activeUserType: UserType;
  setActiveUserType: (type: UserType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeUserType, setActiveUserType }) => {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div 
            className="flex items-center cursor-pointer group" 
            onClick={() => setActiveUserType(UserType.GUEST)}
          >
            <div className="bg-stone-900 text-white p-2 rounded-lg mr-3 group-hover:bg-amber-600 transition-colors">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-stone-900 tracking-tight">Contract to Cozy</h1>
              <p className="text-xs text-stone-500 font-sans tracking-widest uppercase">Signature to Sanctuary</p>
            </div>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-8 items-center">
             <button 
                onClick={() => setActiveUserType(UserType.BUYER)}
                className={`flex items-center px-4 py-2 rounded-full transition-all duration-300 ${
                  activeUserType === UserType.BUYER 
                    ? 'bg-stone-900 text-white shadow-lg' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Key className="w-4 h-4 mr-2" />
                <span>For Buyers</span>
              </button>
              
              <button 
                onClick={() => setActiveUserType(UserType.OWNER)}
                className={`flex items-center px-4 py-2 rounded-full transition-all duration-300 ${
                  activeUserType === UserType.OWNER 
                    ? 'bg-amber-700 text-white shadow-lg' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                <span>For Owners</span>
              </button>
          </div>
          
          {/* Mobile Menu Icon (simplified) */}
          <div className="md:hidden">
            <User className="h-6 w-6 text-stone-700" />
          </div>
        </div>
      </div>
    </nav>
  );
};