import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { canonicalPhone } from '../services/phone';
import { queryClient } from '../app/queries';

export interface SessionUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  platformRole: string | null;
  hasPassword: boolean;
  /** Highest role in the active society; null when the person has no society yet. */
  role: string | null;
  roles: string[];
  flatNumber: string;
  flats: { id: string; number: string }[];
}

export interface SocietySummary {
  id: string;
  name: string;
  status: string;
  roles: string[];
}

/** A request to join a society that is still waiting for a manager. */
export interface PendingRequest {
  id: string;
  society: { id: string; name: string };
  flatNumber: string;
  type: string;
  requestedAt: string;
}

interface MeResponse {
  user: SessionUser;
  activeSocietyId: string | null;
  societies: SocietySummary[];
  pendingRequests: PendingRequest[];
}

export interface AuthContextType {
  user: SessionUser | null;
  activeSocietyId: string | null;
  societies: SocietySummary[];
  pendingRequests: PendingRequest[];
  isAuthenticated: boolean;
  /** Signed in and working inside a society. */
  hasSociety: boolean;
  /** True until the session has been checked against the server. */
  isLoading: boolean;
  signInWithPassword: (phone: string, password: string) => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  /** Re-reads the session, e.g. after creating or switching society. */
  refresh: () => Promise<void>;
  switchSociety: (societyId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Better Auth accepts only canonical numbers; this is what people type. */
function toE164(phone: string): string {
  const value = canonicalPhone(phone);
  if (!value) throw new ApiError(400, 'Enter a valid phone number');
  return value;
}

const post = (path: string, body?: unknown) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

/**
 * The session, read from GET /api/me. The server is the only authority: the
 * session cookie is httpOnly, so the browser cannot inspect it itself.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/api/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setMe(null))
      .finally(() => setIsLoading(false));
  }, [refresh]);

  const signInWithPassword = async (phone: string, password: string) => {
    await post('/api/auth/sign-in/phone-number', { phoneNumber: toE164(phone), password });
    await refresh();
  };

  const sendOtp = async (phone: string) => {
    await post('/api/auth/phone-number/send-otp', { phoneNumber: toE164(phone) });
  };

  // Verifying a number nobody has used yet creates the account.
  const verifyOtp = async (phone: string, code: string) => {
    await post('/api/auth/phone-number/verify', { phoneNumber: toE164(phone), code });
    await refresh();
  };

  const switchSociety = async (societyId: string) => {
    await post('/api/me/active-society', { societyId });
    // Everything cached belongs to the previous society.
    queryClient.clear();
    await refresh();
  };

  const logout = async () => {
    await post('/api/auth/sign-out').catch(() => undefined);
    // A full load drops every cached query and module for the old session.
    window.location.assign('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user: me?.user ?? null,
        activeSocietyId: me?.activeSocietyId ?? null,
        societies: me?.societies ?? [],
        pendingRequests: me?.pendingRequests ?? [],
        isAuthenticated: !!me,
        hasSociety: !!me?.activeSocietyId,
        isLoading,
        signInWithPassword,
        sendOtp,
        verifyOtp,
        refresh,
        switchSociety,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
