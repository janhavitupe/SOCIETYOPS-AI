import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getStoredToken, getStoredUser, setStoredAuth, clearStoredAuth } from '../lib/api';

interface AuthContextType {
  user: any | null;
  token: string | null;
  login: (token: string, user: any) => void;
  logout: () => void;
  isAuthenticated: boolean;
  /** True until the stored token has been checked against the server. */
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState(true);

  // Validate any stored token against the server on load.
  //
  // This used to call verifyToken() from src/auth/authUtils, which pulled
  // jsonwebtoken, bcryptjs and JWT_SECRET into the browser bundle. A signature
  // check only means something where the secret lives, so the server is asked
  // instead and its answer is authoritative.
  useEffect(() => {
    const storedToken = getStoredToken();

    if (!storedToken) {
      clearStoredAuth();
      setIsLoading(false);
      return;
    }

    // Show the cached profile immediately so the UI does not flash, then
    // replace it with whatever the server confirms.
    setToken(storedToken);
    setUser(getStoredUser());

    let cancelled = false;

    api<{ user: any }>('/api/auth/me')
      .then(({ user: verifiedUser }) => {
        if (cancelled) return;
        setUser(verifiedUser);
        setStoredAuth(storedToken, verifiedUser);
      })
      .catch(() => {
        if (cancelled) return;
        // Expired, tampered with, or the account is gone.
        clearStoredAuth();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    setStoredAuth(newToken, newUser);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearStoredAuth();
    window.location.reload(); // Reload to clear any cached data
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!token, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
