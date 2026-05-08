'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';

const ADMIN_EMAILS = ['martin.a.masri@gmail.com', 'cronklam@gmail.com'];

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export default function PylPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !isAdmin(user.email)) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || !user) return null;
  if (!isAdmin(user.email)) return null;

  return (
    <div className="page-enter">
      <PageHeader title="P&L" subtitle="Análisis financiero — Admin" showBack />
      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ marginTop: 12 }}>
          <EyebrowTag>Próximamente</EyebrowTag>
        </div>
        <h2
          className="font-brand heading-tight-lg"
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text)',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            marginTop: 4,
          }}
        >
          Reporte de P&L
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Esta sección va a alimentarse del pipeline de P&L (lharmonie-pnl-upload).
          Por ahora es un placeholder con el styling del dashboard. Cuando esté
          listo el pipeline conectamos los datos.
        </p>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 18,
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {[
            { l: 'Ingresos', v: '—' },
            { l: 'Costos directos', v: '—' },
            { l: 'Margen bruto', v: '—' },
            { l: 'Gastos fijos', v: '—' },
            { l: 'EBITDA', v: '—' },
          ].map((row) => (
            <div
              key={row.l}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13.5,
                color: 'var(--text)',
                paddingBottom: 8,
                borderBottom: '1px dashed var(--border)',
              }}
            >
              <span>{row.l}</span>
              <span
                style={{
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                }}
              >
                {row.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
