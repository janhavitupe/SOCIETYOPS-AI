import React, { createContext, useContext, useState, useEffect } from 'react';
import { verifyToken } from '../auth/authUtils';

interface AuthContextType {
  user: any | null;
  token: string | null;
  login: (token: string, user: any) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Check for existing token on load
  useEffect(() => {
    const storedToken = localStorage.getItem('societyops_token');
    const storedUser = localStorage.getItem('societyops_user');

    if (storedToken && storedUser) {
      const verifiedUser = verifyToken(storedToken);
      if (verifiedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        // Token invalid or expired, clear storage
        localStorage.removeItem('societyops_token');
        localStorage.removeItem('societyops_user');
      }
    }
  }, []);

  const login = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('societyops_token', newToken);
    localStorage.setItem('societyops_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('societyops_token');
    localStorage.removeItem('societyops_user');
    window.location.reload(); // Reload to clear any cached data
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};