'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, type AuthUser } from '../components/AuthProvider';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  // Si ya hay sesión, redirigir.
  useEffect(() => {
    if (user) {
      const next = search.get('next') || '/';
      router.replace(next);
    }
  }, [user, router, search]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google OAuth no está configurado. Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID.');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        if (!window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleResponse,
          itp_support: true,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
        });
        if (btnRef.current) {
          window.google.accounts.id.renderButton(btnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 280,
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'center',
          });
        }
      } catch (e) {
        console.error('Google Sign-In init error:', e);
      }
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleResponse(response: { credential: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        setUser(data.user as AuthUser);
        const next = search.get('next') || '/';
        router.replace(next);
      } else if (data.error === 'not_authorized') {
        const email = data.email ? encodeURIComponent(data.email) : '';
        router.replace(`/unauthorized${email ? `?email=${email}` : ''}`);
      } else {
        setError('Error al iniciar sesión. Intentá de nuevo.');
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    }
    setLoading(false);
  }

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: '100dvh', background: 'var(--bg)' }}
    >
      <div className="lh-login-hero">
        <div className="lh-login-hero-glow" />
        <div className="relative z-10 text-center">
          <div
            style={{
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              fontSize: 38,
              fontWeight: 500,
              color: 'var(--header-text)',
              letterSpacing: '0.005em',
            }}
          >
            Lharmonie
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                height: 1,
                width: 32,
                background:
                  'linear-gradient(to right, transparent, var(--header-accent))',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--header-accent)',
                opacity: 0.95,
              }}
            >
              Management
            </span>
            <span
              style={{
                height: 1,
                width: 32,
                background:
                  'linear-gradient(to left, transparent, var(--header-accent))',
                display: 'inline-block',
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="flex-1 px-6 pt-10 pb-12 flex flex-col items-center gap-6 relative z-10"
        style={{
          background: 'var(--bg)',
          marginTop: -28,
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        }}
      >
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.5,
            marginTop: 8,
          }}
        >
          Ingresá con tu cuenta de Google autorizada para acceder al panel
          privado de management.
        </p>

        <div
          ref={btnRef}
          style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }}
        />

        {loading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Verificando…
          </div>
        )}
        {error && (
          <div
            style={{
              color: 'var(--red)',
              background: 'var(--red-bg)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              maxWidth: 320,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
