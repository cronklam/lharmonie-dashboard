'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
      <UnauthorizedInner />
    </Suspense>
  );
}

function UnauthorizedInner() {
  const search = useSearchParams();
  const email = search.get('email');
  const { logout } = useAuth();

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontSize: 28,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
        }}
      >
        Acceso restringido
      </div>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: 14.5,
          maxWidth: 380,
          lineHeight: 1.55,
          marginBottom: 8,
        }}
      >
        Este dashboard es solo para management de Lharmonie. Si crees que es un
        error, contactá a Martín.
      </p>
      {email && (
        <p
          style={{
            color: 'var(--text-dim)',
            fontSize: 12.5,
            marginBottom: 24,
          }}
        >
          Cuenta usada: <strong style={{ color: 'var(--text-muted)' }}>{email}</strong>
        </p>
      )}
      <button className="lh-btn lh-btn-primary" onClick={logout}>
        Volver
      </button>
    </div>
  );
}
