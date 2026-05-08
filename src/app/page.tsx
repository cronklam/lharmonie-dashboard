'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from './components/AuthProvider';
import {
  COL,
  esAPagar,
  esPagado,
  fmtMoney,
  mesIndex,
  mesLabel,
  parseFechaFC,
  parseNum,
  shortLocal,
  useFacturasStore,
  type Factura,
} from './components/FacturasStore';
import AnimatedNumber from './components/AnimatedNumber';
import EyebrowTag from './components/EyebrowTag';
import { BarChart, DoughnutChart } from './components/Charts';

type Periodo = 'semana' | 'mes' | 'pasado' | 'todo';

const PERIOD_OPTIONS: { id: Periodo; label: string }[] = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'pasado', label: 'Mes pasado' },
  { id: 'todo', label: 'Todo' },
];

function filterByPeriod(facturas: Factura[], id: Periodo): Factura[] {
  if (id === 'todo') return facturas;
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (id === 'semana') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    return facturas.filter((f) => {
      const d = parseFechaFC(f[COL.fecha]);
      return d && d >= weekAgo && d <= now;
    });
  }
  if (id === 'mes') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return facturas.filter((f) => {
      const d = parseFechaFC(f[COL.fecha]);
      return d && d >= first && d <= now;
    });
  }
  // pasado: mes anterior completo
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return facturas.filter((f) => {
    const d = parseFechaFC(f[COL.fecha]);
    return d && d >= startPrev && d <= endPrev;
  });
}

function previousPeriod(facturas: Factura[], id: Periodo): Factura[] {
  if (id === 'todo' || id === 'pasado') return [];
  const now = new Date();
  if (id === 'semana') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoAgo = new Date(now);
    twoAgo.setDate(twoAgo.getDate() - 14);
    return facturas.filter((f) => {
      const d = parseFechaFC(f[COL.fecha]);
      return d && d >= twoAgo && d < weekAgo;
    });
  }
  // mes: mes pasado
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return facturas.filter((f) => {
    const d = parseFechaFC(f[COL.fecha]);
    return d && d >= startPrev && d <= endPrev;
  });
}

function firstName(name?: string): string {
  if (!name) return 'Hola';
  return name.split(/\s+/)[0] || 'Hola';
}

function todayKey(): { ddmm: string; ddmmyyyy: string } {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return { ddmm: `${dd}/${mm}`, ddmmyyyy: `${dd}/${mm}/${yyyy}` };
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading, slowLoad, error, refresh } = useFacturasStore();
  const [periodo, setPeriodo] = useState<Periodo>('mes');

  // Pendientes / pagadas (sin filtro de periodo — el "Total a pagar"
  // siempre suma TODAS las pendientes, no se filtra por periodo).
  const pendientes = useMemo(() => facturas.filter(esAPagar), [facturas]);
  const pagadas = useMemo(() => facturas.filter(esPagado), [facturas]);
  const totalPend = useMemo(
    () => pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0),
    [pendientes],
  );

  // Cargadas hoy (por Procesado o Fecha FC).
  const hoyFacts = useMemo(() => {
    const { ddmm, ddmmyyyy } = todayKey();
    return facturas.filter((f) => {
      const fp = f[COL.procesado] || '';
      const ff = f[COL.fecha] || '';
      return fp.startsWith(ddmm) || ff === ddmmyyyy;
    });
  }, [facturas]);
  const totalHoy = hoyFacts.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  // Filtrados por periodo (para KPI gasto y charts).
  const facturasP = useMemo(() => filterByPeriod(facturas, periodo), [facturas, periodo]);
  const facturasPrev = useMemo(
    () => previousPeriod(facturas, periodo),
    [facturas, periodo],
  );

  const totalPeriodo = facturasP.reduce((s, f) => s + parseNum(f[COL.total]), 0);
  const totalAnterior = facturasPrev.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  // % cambio vs anterior
  let change = 0;
  if (totalAnterior > 0)
    change = ((totalPeriodo - totalAnterior) / totalAnterior) * 100;
  if (Math.abs(change) > 999) change = change > 0 ? 999 : -999;
  const isLessSpending = change <= 0;

  // Daily average
  const daysInPeriod = new Set<string>();
  facturasP.forEach((f) => {
    if (f[COL.fecha]) daysInPeriod.add(f[COL.fecha]);
  });
  const dailyAvg = totalPeriodo / Math.max(1, daysInPeriod.size);

  // Deuda por proveedor (sin periodo — siempre todas las pendientes)
  const provDeuda = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    pendientes.forEach((f) => {
      const p = f[COL.proveedor] || '(sin nombre)';
      if (!map[p]) map[p] = { total: 0, count: 0 };
      map[p].total += parseNum(f[COL.total]);
      map[p].count++;
    });
    return Object.entries(map)
      .map(([prov, d]) => ({
        prov,
        total: d.total,
        count: d.count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [pendientes]);

  // Comparativa por local (filtrado por periodo)
  const localesData = useMemo(() => {
    const map: Record<string, number> = {};
    facturasP.forEach((f) => {
      const l = f[COL.local] || 'Sin local';
      map[l] = (map[l] || 0) + parseNum(f[COL.total]);
    });
    return Object.entries(map)
      .map(([loc, val]) => ({ loc, val }))
      .sort((a, b) => b.val - a.val);
  }, [facturasP]);
  const maxLocal = localesData[0]?.val || 1;

  // Charts data
  const monthSeries = useMemo(() => {
    const map: Record<string, number> = {};
    facturasP.forEach((f) => {
      const mes = (f[COL.mes] || '').toLowerCase().trim();
      const anio = f[COL.anio] || '';
      const key = mes && anio ? `${mes} ${anio}` : '';
      if (!key) return;
      map[key] = (map[key] || 0) + parseNum(f[COL.total]);
    });
    const sorted = Object.entries(map).sort((a, b) => {
      const [mA, yA] = a[0].split(' ');
      const [mB, yB] = b[0].split(' ');
      if (yA !== yB) return parseInt(yA) - parseInt(yB);
      return mesIndex(mA) - mesIndex(mB);
    });
    const now = new Date();
    return {
      labels: sorted.map(([k]) => {
        const idx = mesIndex(k.split(' ')[0]);
        return idx >= 0 ? mesLabel(idx) : k.split(' ')[0];
      }),
      values: sorted.map(([, v]) => v),
      highlightIdx: sorted.findIndex(([k]) => {
        const [m, y] = k.split(' ');
        return mesIndex(m) === now.getMonth() && y === String(now.getFullYear());
      }),
    };
  }, [facturasP]);

  const catSeries = useMemo(() => {
    const map: Record<string, number> = {};
    facturasP.forEach((f) => {
      const cat = (f[COL.categoria] || 'Sin cat')
        .replace(/^[^\w\s]+\s*/, '')
        .trim()
        .split('/')[0]
        .trim();
      map[cat] = (map[cat] || 0) + parseNum(f[COL.total]);
    });
    const top = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const total = top.reduce((s, [, v]) => s + v, 0);
    return {
      labels: top.map(([cat, val]) => `${cat} (${total > 0 ? Math.round((val / total) * 100) : 0}%)`),
      values: top.map(([, v]) => v),
    };
  }, [facturasP]);

  const ultima = facturas.length > 0 ? facturas[facturas.length - 1] : null;

  if (authLoading || !user) return null;

  return (
    <div className="page-enter px-4 pt-4 lh-inicio-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Status banner — visible solo en estados anómalos (loading inicial,
          slow load, o error). Mejor que mostrar zeros sin contexto. */}
      {(loading && facturas.length === 0) || slowLoad || error ? (
        <section
          style={{
            background: error
              ? 'rgba(217,95,78,0.10)'
              : 'rgba(196,160,103,0.10)',
            color: error ? '#C84F3F' : 'var(--text-muted)',
            border: `1px solid ${
              error ? 'rgba(217,95,78,0.30)' : 'rgba(196,160,103,0.25)'
            }`,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>
            {error
              ? error
              : slowLoad
              ? 'Tardando más de lo normal… cold start del servidor.'
              : 'Cargando facturas…'}
          </span>
          {(error || slowLoad) && (
            <button
              onClick={refresh}
              disabled={loading}
              className="spring-tap"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text)',
                border: '1px solid rgba(196,160,103,0.30)',
                opacity: loading ? 0.5 : 1,
              }}
            >
              ↻ Reintentar
            </button>
          )}
        </section>
      ) : null}

      {/* Saludo + Hero "Total a pagar" */}
      <section>
        <div style={{ marginBottom: 8 }}>
          <EyebrowTag>Hola, {firstName(user.name)}</EyebrowTag>
        </div>
        <div className="lh-hero-total spring-in">
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#C4A067',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Total a pagar
          </div>
          <div
            className="font-brand heading-tight-lg"
            style={{
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1,
              color: '#F9F7F3',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            <AnimatedNumber
              value={totalPend}
              duration={1100}
              format={(n) => fmtMoney(n)}
            />
          </div>
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {pendientes.length} factura{pendientes.length !== 1 ? 's' : ''} pendiente
            {pendientes.length !== 1 ? 's' : ''}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <Link
              href="/a-pagar"
              className="btn-glow-accent spring-tap"
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Ver pendientes →
            </Link>
            <button
              onClick={refresh}
              className="spring-tap"
              aria-label="Actualizar"
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.06)',
                color: '#F9F7F3',
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid rgba(196,160,103,0.20)',
              }}
            >
              ↻ {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
        </div>
      </section>

      {/* Period chips */}
      <section
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollSnapType: 'x mandatory',
        }}
      >
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            className={`lh-period-chip${periodo === p.id ? ' is-active' : ''}`}
            style={{ scrollSnapAlign: 'start' }}
          >
            {p.label}
          </button>
        ))}
      </section>

      {/* KPI gasto del periodo */}
      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 18,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {periodo === 'semana'
            ? 'Gasto esta semana'
            : periodo === 'mes'
            ? 'Gasto este mes'
            : periodo === 'pasado'
            ? 'Gasto mes pasado'
            : 'Gasto total'}
        </div>
        <div
          className="font-brand heading-tight-lg"
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
            lineHeight: 1,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          <AnimatedNumber
            value={totalPeriodo}
            duration={900}
            format={(n) => fmtMoney(n)}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          <span>Prom. diario: {fmtMoney(dailyAvg)}</span>
          {totalAnterior > 0 && (
            <span
              style={{
                color: isLessSpending ? 'var(--green)' : '#C84F3F',
                fontWeight: 600,
              }}
            >
              {change > 0 ? '↑' : '↓'} {Math.abs(Math.round(change))}% vs anterior
            </span>
          )}
        </div>
      </section>

      {/* Stats row */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard
          label="Pendientes"
          value={
            <AnimatedNumber
              value={pendientes.length}
              format={(n) => Math.round(n).toString()}
            />
          }
          sub="facturas a pagar"
        />
        <StatCard
          label="Cargadas hoy"
          value={
            <AnimatedNumber
              value={hoyFacts.length}
              format={(n) => Math.round(n).toString()}
            />
          }
          sub={hoyFacts.length ? fmtMoney(totalHoy) : 'ninguna hoy'}
        />
      </section>

      {/* Última carga */}
      {ultima && (
        <section
          style={{
            background: 'var(--bg-card-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--accent)',
              animation: 'glowPulse 1.8s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              Última factura cargada
            </div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--text)',
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ultima[COL.proveedor] || '—'} · {ultima[COL.fecha] || '—'}
              {ultima[COL.local] ? ` · ${shortLocal(ultima[COL.local])}` : ''}
            </div>
          </div>
        </section>
      )}

      {/* Deuda por proveedor */}
      <section>
        <SectionTitle>Deuda por proveedor</SectionTitle>
        {provDeuda.length === 0 ? (
          <EmptyState icon="🎉" text="Sin deuda pendiente" />
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
            {provDeuda.slice(0, 8).map((d) => (
              <li key={d.prov}>
                <Link
                  href={`/proveedores/${encodeURIComponent(d.prov)}`}
                  className="lh-prov-row spring-tap"
                  style={{ display: 'flex' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.prov}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {d.count} factura{d.count !== 1 ? 's' : ''}
                      {totalPend > 0 && ` · ${Math.round((d.total / totalPend) * 100)}% del total`}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                      fontWeight: 700,
                      fontSize: 15,
                      color: 'var(--text)',
                    }}
                  >
                    {fmtMoney(d.total)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Charts */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionTitle>Análisis de gasto</SectionTitle>
        {monthSeries.values.length > 0 && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Evolución mensual
            </div>
            <BarChart
              labels={monthSeries.labels}
              values={monthSeries.values}
              highlightIdx={monthSeries.highlightIdx}
            />
          </div>
        )}
        {catSeries.values.length > 0 && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Gasto por categoría
            </div>
            <DoughnutChart labels={catSeries.labels} values={catSeries.values} />
          </div>
        )}
      </section>

      {/* Comparativa por local */}
      {localesData.length > 0 && (
        <section>
          <SectionTitle>Comparativa por local</SectionTitle>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 14,
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {localesData.map((d) => (
              <div key={d.loc}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    {shortLocal(d.loc)}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: 'var(--text)',
                    }}
                  >
                    {fmtMoney(d.val)}
                  </span>
                </div>
                <div className="lh-local-bar">
                  <div
                    className="lh-local-bar-fill"
                    style={{ width: `${(d.val / maxLocal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cargadas hoy (oculto si vacío) */}
      {hoyFacts.length > 0 && (
        <section>
          <SectionTitle>Cargadas hoy</SectionTitle>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
            {hoyFacts
              .slice()
              .reverse()
              .map((f) => (
                <li key={f._id}>
                  <Link
                    href={`/factura/${encodeURIComponent(f._id || '')}`}
                    className="spring-tap"
                    style={{ display: 'block' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: 12,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {f[COL.proveedor] || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {shortLocal(f[COL.local] || '—')} · {f[COL.fecha] || '—'}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                          fontWeight: 700,
                          fontSize: 14.5,
                          color: 'var(--text)',
                        }}
                      >
                        {fmtMoney(parseNum(f[COL.total]))}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="font-brand"
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginTop: 4,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-brand heading-tight"
      style={{
        fontSize: 17,
        fontWeight: 600,
        color: 'var(--text)',
        marginBottom: 10,
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h2>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '28px 16px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 14,
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      {text}
    </div>
  );
}
