import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
}

interface Membership {
  org_id: string;
  role: string;
  status: string;
}

interface AuthContextType {
  user: User | null;
  memberships: Membership[];
  currentOrgId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, orgName: string, orgSlug: string) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentOrgId: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const response = await authApi.me();
          setUser(response.data.data.user);
          setMemberships(response.data.data.memberships);

          // Set default org
          const savedOrgId = localStorage.getItem('current_org_id');
          if (savedOrgId && response.data.data.memberships.some((m: Membership) => m.org_id === savedOrgId)) {
            setCurrentOrgId(savedOrgId);
          } else if (response.data.data.memberships.length > 0) {
            setCurrentOrgId(response.data.data.memberships[0].org_id);
          }
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const { user, tokens, memberships } = response.data.data;

    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);

    setUser(user);
    setMemberships(memberships);

    if (memberships.length > 0) {
      setCurrentOrgId(memberships[0].org_id);
      localStorage.setItem('current_org_id', memberships[0].org_id);
    }
  };

  const signup = async (email: string, password: string, orgName: string, orgSlug: string) => {
    await authApi.signup(email, password, { name: orgName, slug: orgSlug });
    // After signup, user needs to verify email, so we don't auto-login
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore logout errors
      }
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_org_id');
    setUser(null);
    setMemberships([]);
    setCurrentOrgId(null);
  };

  const handleSetCurrentOrgId = (orgId: string) => {
    setCurrentOrgId(orgId);
    localStorage.setItem('current_org_id', orgId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        currentOrgId,
        isLoading,
        login,
        signup,
        logout,
        setCurrentOrgId: handleSetCurrentOrgId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
