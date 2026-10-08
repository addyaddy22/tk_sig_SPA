import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const qc = useQueryClient();

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const accept = useCallback(
    (res: { accessToken: string; user: User }) => {
      tokenStore.set(res.accessToken);
      setUser(res.user);
      qc.invalidateQueries();
      return res.user;
    },
    [qc],
  );

  const value: AuthState = {
    user,
    loading,
    login: (email, password) =>
      api<{ accessToken: string; user: User }>('/auth/login', { body: { email, password } }).then(accept),
    register: (data) => api<{ accessToken: string; user: User }>('/auth/register', { body: data }).then(accept),
    logout: () => {
      tokenStore.clear();
      setUser(null);
      qc.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
