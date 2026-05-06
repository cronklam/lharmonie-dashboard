'use client';

interface Props {
  title: string;
  description: string;
  modules: { name: string; note?: string }[];
}

export function PlaceholderScreen({ title, description, modules }: Props) {
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
          Próximamente
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
          {title}
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          {description}
        </p>
      </header>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
        {modules.map((m) => (
          <li key={m.name} className="lh-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{m.name}</div>
              {m.note && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{m.note}</div>
              )}
            </div>
            <span className="lh-card-pill coming">Próximamente</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
