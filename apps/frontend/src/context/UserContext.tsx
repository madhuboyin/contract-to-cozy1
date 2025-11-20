// apps/frontend/src/context/UserContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserType } from '@/types';

interface UserContextType {
  activeUserType: UserType;
  setActiveUserType: (type: UserType) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize with GUEST
  const [activeUserType, setActiveUserType] = useState<UserType>(UserType.GUEST);

  // Scroll to top when user type switches to ensure they see the new hero
  useEffect(() => {
    // Only scroll if we are switching from GUEST to BUYER/OWNER or vice-versa
    if (activeUserType !== UserType.GUEST) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeUserType]);

  const contextValue = {
    activeUserType,
    setActiveUserType,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserType = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserType must be used within a UserContextProvider');
  }
  return context;
};