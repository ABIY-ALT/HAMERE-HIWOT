'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { appUsers, updateUserFirstLogin } from '@/lib/mock-data';
import type { AppUser } from '@/types';

interface AuthContextType {
  user: AppUser | null;
  login: (userId: number) => void;
  logout: () => void;
  completeFirstLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);

  // Simulate login persistence on page load
  useEffect(() => {
    const loggedInUserId = sessionStorage.getItem('loggedInUserId');
    if (loggedInUserId) {
      const foundUser = appUsers.find(u => u.id === parseInt(loggedInUserId, 10));
      setUser(foundUser || null);
    }
  }, []);

  const login = (userId: number) => {
    const userToLogin = appUsers.find(u => u.id === userId);
    if (userToLogin) {
      setUser(userToLogin);
      sessionStorage.setItem('loggedInUserId', String(userId));
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('loggedInUserId');
  };

  const completeFirstLogin = () => {
    if (user) {
      updateUserFirstLogin(user.id, false);
      const updatedUser = { ...user, isFirstLogin: false };
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, completeFirstLogin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
