'use client';

import { PlaceholderScreen } from '../components/PlaceholderScreen';
import { useAuth } from '../components/AuthProvider';

export default function ControlPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return (
    <PlaceholderScreen
      title="Control"
      description="Auditoría financiera y control de caja. Esta sección se va a completar en una próxima fase."
      modules={[
        { name: 'Caja chica', note: 'Movimientos por local, conciliación diaria.' },
        { name: 'Caja grande', note: 'Saldo y transferencias entre locales.' },
        { name: 'Servicios', note: 'Luz, gas, alquileres, internet por local.' },
      ]}
    />
  );
}
