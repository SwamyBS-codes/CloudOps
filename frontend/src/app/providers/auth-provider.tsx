import React, { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import { authService } from '@/services/auth-service';
import { AUTH_TOKEN_KEY } from '@/lib/constants';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any | null;
  login: (credentials: any) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

declare global {
  interface Window {
    __cloudopsAuthContext?: React.Context<AuthContextType | undefined>;
  }
}

const AuthContext =
  window.__cloudopsAuthContext || createContext<AuthContextType | undefined>(undefined);

window.__cloudopsAuthContext = AuthContext;

const decodeJWT = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

type AuthResponse = {
  token?: string;
  user?: any;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const login = useCallback(async (credentials: any): Promise<boolean> => {
    setLoading(true);
    try {
      if (credentials.token) {
        // Token from OAuth callback
        localStorage.setItem(AUTH_TOKEN_KEY, credentials.token);
        const payload = decodeJWT(credentials.token);
        if (!payload) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setIsAuthenticated(false);
          setUser(null);
          return false;
        }
        setIsAuthenticated(true);
        setUser(payload);
        return true;
      } else {
        // Regular login
        const response = await authService.login(credentials.email, credentials.password);
        if (!(response.data as any)?.token) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setIsAuthenticated(false);
          setUser(null);
          return false;
        }

        localStorage.setItem(AUTH_TOKEN_KEY, (response.data as any).token);
        setIsAuthenticated(true);
        setUser((response.data as any).user);
        return true;
      }
    } catch (error) {
      console.error('Auth login failed:', error);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setIsAuthenticated(false);
      setUser(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const verifyAuth = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      try {
        const response = await authService.verify();
        const data = response.data as AuthResponse;
        setUser(data.user || null);
        setIsAuthenticated(true);
      } catch (error) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setIsAuthenticated(false);
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      user,
      login,
      logout,
      loading,
    }),
    [isAuthenticated, user, login, logout, loading]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center px-4 py-8 border border-border bg-card">
          <div className="text-xl font-semibold mb-2">Checking authentication…</div>
          <div className="text-sm text-muted-foreground">Please wait while we restore your session.</div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
