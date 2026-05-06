'use client';

import { PlaceholderScreen } from '../components/PlaceholderScreen';
import { useAuth } from '../components/AuthProvider';

export default function EquipoPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return (
    <PlaceholderScreen
      title="Equipo"
      description="Vista del equipo de Lharmonie. Esta sección se va a completar en una próxima fase."
      modules={[
        { name: 'Directorio', note: 'Empleados activos con contacto y rol.' },
        { name: 'Asistencia', note: 'Faltas, llegadas tarde y novedades.' },
        { name: 'Cumpleaños', note: 'Próximos cumpleaños del equipo.' },
      ]}
    />
  );
}
