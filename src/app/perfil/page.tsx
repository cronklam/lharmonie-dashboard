'use client';

import { useAuth } from '../components/AuthProvider';

export default function PerfilPage() {
  const { user, loading, logout } = useAuth();
  if (loading || !user) return null;

  return (
    <div className="px-5 pt-6 lh-fade-in">
      <header className="mb-6">
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          Tu cuenta
        </p>
        <h1
          className="font-brand"
          style={{
            fontSize: 28,
            fontWeight: 600,
            marginTop: 4,
            color: 'var(--text)',
          }}
        >
          Perfil
        </h1>
      </header>

      <section
        className="lh-card"
        style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.picture}
            alt=""
            width={56}
            height={56}
            style={{
              borderRadius: '50%',
              border: '2px solid var(--border-accent)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 20,
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>
            {user.name || 'Usuario'}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.email}
          </div>
          <span
            className="lh-card-pill"
            style={{ marginTop: 6, fontSize: 10 }}
          >
            Management
          </span>
        </div>
      </section>

      <button
        className="lh-btn lh-btn-ghost"
        style={{ width: '100%' }}
        onClick={logout}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
