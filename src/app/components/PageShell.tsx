'use client';

import { PageHeader } from './PageHeader';

// PageShell — wrapper común para TODAS las pages del dashboard. Antes
// cada page repetía:
//   <div className="page-enter">
//     <PageHeader title="X" subtitle="Y" showBack />
//     <div className="px-4 pt-4" style={{ display:'flex', flexDirection:'column', gap:14 }}>
//       {content}
//     </div>
//   </div>
//
// Con PageShell queda:
//   <PageShell title="X" subtitle="Y" showBack>
//     {content}
//   </PageShell>
//
// Para casos con layout custom (caja, revisar, etc.) pasar `raw` para
// saltearse el padding/gap default y rendereaR el children plano.

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** Botón / nodo a la derecha del header. */
  headerRight?: React.ReactNode;
  /** Si true: NO mete children en wrapper con padding/gap. */
  raw?: boolean;
  /** Override del gap entre secciones. Default 14. */
  gap?: number;
  /** Clases extra al wrapper interno (ej. "lh-inicio-stagger"). */
  contentClassName?: string;
  /** Style extra al wrapper interno (ej. paddingBottom). */
  contentStyle?: React.CSSProperties;
  /** Modales / sheets / portales que viven fuera del wrapper interno
   *  (sin recibir su padding/gap) pero dentro del page-enter. */
  extras?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({
  title,
  subtitle,
  showBack,
  headerRight,
  raw = false,
  gap = 14,
  contentClassName,
  contentStyle,
  extras,
  children,
}: Props) {
  return (
    <div className="page-enter">
      <PageHeader
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        rightSlot={headerRight}
      />
      {raw ? (
        children
      ) : (
        <div
          className={['px-4 pt-4', contentClassName].filter(Boolean).join(' ')}
          style={{ display: 'flex', flexDirection: 'column', gap, ...contentStyle }}
        >
          {children}
        </div>
      )}
      {extras}
    </div>
  );
}
