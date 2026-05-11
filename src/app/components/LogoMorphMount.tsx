'use client';

import LogoMorphController from './LogoMorphController';
import { useAuth } from './AuthProvider';

// Mount persistente del LogoMorphController. Vive en el root layout
// (no en /login) para que el clone sobreviva a la navegación de
// /login → /. Lee el estado del AuthProvider y dispara onComplete
// para limpiar el flag global.

export function LogoMorphMount() {
  const { logoMorphActive, endLogoMorph } = useAuth();
  return (
    <LogoMorphController
      active={logoMorphActive}
      tone="luxe"
      onComplete={endLogoMorph}
    />
  );
}
