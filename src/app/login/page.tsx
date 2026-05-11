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
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />
      }
    >
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, setUser, triggerLogoMorph } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      const next = search.get('next') || '/';
      router.replace(next);
    }
  }, [user, router, search]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google OAuth no está configurado.');
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
        // Dispara morph del wordmark login → topnav (1300ms). El
        // LogoMorphMount vive en el layout, así que sobrevive la
        // navegación. El target del header aparece al renderizar /,
        // el controller hace polling de hasta ~500ms para encontrarlo.
        triggerLogoMorph();
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
    <div className="flex flex-col" style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Hero (gradient + ambient glow + isotipo + wordmark + decorative line) */}
      <div
        className="relative overflow-hidden flex flex-col items-center justify-center"
        style={{
          minHeight: '52vh',
          background:
            'linear-gradient(165deg, #060403 0%, #1A100A 30%, #2A1810 70%, #0D0805 100%)',
        }}
      >
        <div
          className="absolute"
          style={{
            width: 220,
            height: 220,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(196,160,103,0.16) 0%, transparent 70%)',
            animation: 'glow-pulse 4s ease-in-out infinite',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
          }}
        />
        <div className="login-particles absolute inset-0 pointer-events-none">
          <span /><span /><span /><span /><span />
        </div>

        <div className="relative z-10 text-center" style={{ animation: 'reveal-up 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) both' }}>
          <div
            data-logo-anchor="login-source"
            style={{
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              fontSize: 42,
              fontWeight: 500,
              color: '#F9F7F3',
              letterSpacing: '0.005em',
              lineHeight: 1,
              display: 'inline-block',
            }}
          >
            Lharmonie
          </div>
          <div
            className="mt-4 inline-flex items-center gap-3"
            style={{ opacity: 0, animation: 'reveal-up 0.5s ease-out 0.6s both' }}
          >
            <div
              style={{
                height: 1,
                width: 40,
                background: 'linear-gradient(to right, transparent, #C4A067)',
                transformOrigin: 'right',
                animation: 'line-expand 0.6s ease-out 0.8s both',
              }}
            />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: '#C4A067',
                opacity: 0,
                animation: 'reveal-text 0.5s ease-out 0.9s both',
              }}
            >
              Management
            </span>
            <div
              style={{
                height: 1,
                width: 40,
                background: 'linear-gradient(to left, transparent, #C4A067)',
                transformOrigin: 'left',
                animation: 'line-expand 0.6s ease-out 0.8s both',
              }}
            />
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: 60,
            background:
              'linear-gradient(to top, var(--bg) 0%, transparent 100%)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          }}
        />
      </div>

      {/* Card area (overlapping hero) */}
      <div
        className="flex-1 px-5 pt-2 pb-10 relative z-20 lh-login-stagger"
        style={{
          background: 'var(--bg)',
          marginTop: -32,
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'var(--border-strong)',
              opacity: 0.6,
            }}
          />
        </div>

        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 320,
            margin: '12px auto 22px',
            lineHeight: 1.5,
          }}
        >
          Ingresá con tu cuenta de Google autorizada para acceder al panel privado de management.
        </p>

        <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />

        {loading && (
          <div
            style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 16 }}
          >
            Verificando…
          </div>
        )}
        {error && (
          <div
            style={{
              color: 'var(--red, #C84F3F)',
              background: 'rgba(217,95,78,0.10)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              maxWidth: 320,
              margin: '16px auto 0',
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
