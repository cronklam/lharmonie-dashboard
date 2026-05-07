'use client';

import { usePathname } from 'next/navigation';

// Top nav exclusive: más oscuro/luxury que el del staff. Diferencia
// visualmente este dashboard como surface privado de management.
export function TopNav() {
  const pathname = usePathname();
  // En login y unauthorized no mostramos el top nav.
  if (pathname === '/login' || pathname === '/unauthorized') return null;
  return (
    <header className="lh-topnav">
      <div className="lh-topnav-brand">Lharmonie</div>
      <div className="lh-topnav-tag">MANAGEMENT</div>
    </header>
  );
}
