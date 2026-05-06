'use client';

import { PlaceholderScreen } from '../components/PlaceholderScreen';
import { useAuth } from '../components/AuthProvider';

export default function OperacionesPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return (
    <PlaceholderScreen
      title="Operaciones"
      description="Datos operativos del día a día. Esta sección se va a completar en una próxima fase."
      modules={[
        { name: 'P&L', note: 'Reporte mensual de pérdidas y ganancias por local.' },
        { name: 'Sueldos', note: 'Liquidaciones, adelantos y horas extras.' },
        { name: 'Compras', note: 'Pedidos, proveedores y costos.' },
      ]}
    />
  );
}
