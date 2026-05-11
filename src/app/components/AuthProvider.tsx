'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

export type AuthRole = 'owner' | 'admin' | 'viewer' | null;

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  role?: AuthRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  // Morph del wordmark "Lharmonie" del login al header del home.
  // El login lo activa al autenticarse OK; el controlador en layout lo
  // ejecuta y dispara onComplete. Persiste a través de la navegación.
  logoMorphActive: boolean;
  triggerLogoMorph: () => void;
  endLogoMorph: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const PUBLIC_PATHS = new Set(['/login', '/unauthorized']);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
          if (!PUBLIC_PATHS.has(pathname)) {
            router.replace('/login');
          }
        }
      } catch {
        if (!cancelled && !PUBLIC_PATHS.has(pathname)) router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const isOwner = user?.role === 'owner';
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const [logoMorphActive, setLogoMorphActive] = useState(false);
  const triggerLogoMorph = useCallback(() => setLogoMorphActive(true), []);
  const endLogoMorph = useCallback(() => setLogoMorphActive(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        setUser,
        logout,
        isOwner,
        isAdmin,
        logoMorphActive,
        triggerLogoMorph,
        endLogoMorph,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
