'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// Mismo mapping que el dashboard viejo (dash/app.js).
// Coincide 1:1 con los headers del tab "Facturas" del Sheet.
export const COL = {
  fecha: 'Fecha FC',
  proveedor: 'Proveedor',
  cuit: 'CUIT',
  tipoDoc: 'Tipo Doc',
  pv: '# PV',
  nroFac: '# Factura',
  categoria: 'Categoría',
  local: 'Local',
  cajero: 'Cajero',
  importeNeto: 'Importe Neto',
  iva21: 'IVA 21%',
  iva105: 'IVA 10.5%',
  total: 'Total',
  medioPago: 'Medio de Pago',
  estado: 'Estado',
  fechaPago: 'Fecha de Pago',
  obs: 'Observaciones',
  procesado: 'Procesado',
  imagen: 'Imagen',
  mes: 'Mes',
  anio: 'Año',
} as const;

// _sheetRow viene como number desde el server (JSON) y se convierte a string
// en el cliente (FacturasProvider) para encajar con el index signature de
// strings — al llamar al worker para marcar pagada lo volvemos a parsear a int.
export type Factura = Record<string, string>;

export function parseNum(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(
    String(v || 0)
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, ''),
  );
  return isNaN(n) ? 0 : n;
}

export function fmtMoney(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}

export function shortLocal(s: string): string {
  return (s || '').replace(/Lharmonie\s+/i, 'LH ');
}

// Normaliza el string de Estado para matchear robusto:
//   - NFKC (compone acentos / colapsa formas)
//   - NBSP ( ) → espacio normal
//   - colapsa whitespace múltiple
//   - lowercase + trim
// Sin esto, un Estado "A pagar — Transferencia" (NBSP entre A y
// pagar, como suele pegar el bot/Sheet) no matcheaba `includes('a pagar')`.
function normalizeEstado(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function esPagado(f: Factura): boolean {
  const e = normalizeEstado(String(f[COL.estado] || ''));
  return (
    e.includes('previamente') ||
    e.includes('pagado') ||
    e.includes('pagada') ||
    e.includes('pago realizado') ||
    e.includes('✅')
  );
}

export function esBistrosoft(f: Factura): boolean {
  const e = normalizeEstado(String(f[COL.estado] || ''));
  const obs = String(f[COL.obs] || '').toLowerCase();
  const proc = String(f[COL.procesado] || '').toLowerCase();
  return (
    e.includes('bistrosoft') ||
    obs.includes('cargada por bistrosoft') ||
    proc.includes('bistrosoft')
  );
}

export function esAPagar(f: Factura): boolean {
  if (esPagado(f)) return false;
  const e = normalizeEstado(String(f[COL.estado] || ''));
  if (!e) return false;
  // "pagar" como palabra: matchea "A pagar", "Por pagar", "Falta pagar",
  // "Pagar" solo, "Pagar - Transferencia", etc. El word boundary evita
  // matchear "pagar" como parte de "pagado"/"pagada" (que igual ya están
  // excluidas por esPagado arriba).
  if (/\bpagar\b/.test(e)) return true;
  if (e.includes('pendiente')) return true;
  // Heredado: status que solo nombran el medio de pago se interpretan
  // como "a pagar por ese medio".
  if (e.includes('transferencia')) return true;
  if (e.includes('efectivo')) return true;
  if (e.includes('bistrosoft')) return true;
  return false;
}

export function parseFechaFC(str: string | undefined): Date | null {
  if (!str) return null;
  const p = str.split('/');
  if (p.length !== 3) return null;
  return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
}

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function mesIndex(name: string): number {
  return MESES_ES.indexOf((name || '').toLowerCase().trim());
}

export function mesLabel(idx: number): string {
  return MESES_ES[idx] ? MESES_ES[idx][0].toUpperCase() + MESES_ES[idx].slice(1) : '';
}

export interface WriteOpResult {
  ok: boolean;
  error?: string;
}

interface StoreValue {
  facturas: Factura[];
  loading: boolean;
  // True cuando un fetch está tardando >8s — para mostrar warning de cold start.
  slowLoad: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pendingCount: number;
  totalPending: number;
  // Marcar pagada — devuelve { ok, error? }. Hace refresh si OK.
  marcarPagada: (f: Factura) => Promise<WriteOpResult>;
  // Eliminar factura — limpia la fila del Sheet (no shift). Hace refresh si OK.
  eliminarFactura: (f: Factura) => Promise<WriteOpResult>;
  // Cambia "Medio de Pago" en el Sheet (NO toca Estado ni Fecha de Pago).
  actualizarMedioPago: (f: Factura, medio: string) => Promise<WriteOpResult>;
}

const FacturasContext = createContext<StoreValue | null>(null);

export function useFacturasStore(): StoreValue {
  const ctx = useContext(FacturasContext);
  if (!ctx) {
    // Defensivo: si el provider no está montado (fuera del shell auth),
    // devolvemos un estado vacío en lugar de tirar para no romper la
    // bottom nav en /login.
    return {
      facturas: [],
      loading: false,
      slowLoad: false,
      error: null,
      refresh: async () => {},
      pendingCount: 0,
      totalPending: 0,
      marcarPagada: async () => ({ ok: false, error: 'Sin sesión' }),
      eliminarFactura: async () => ({ ok: false, error: 'Sin sesión' }),
      actualizarMedioPago: async () => ({ ok: false, error: 'Sin sesión' }),
    };
  }
  return ctx;
}

export function FacturasProvider({ children }: { children: React.ReactNode }) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSlowLoad(false);
    setError(null);

    // Marcar como "slow" después de 8s para que la UI pueda avisar al usuario
    // que es cold-start del Sheets API (sin abortar el fetch).
    const slowTimer = setTimeout(() => setSlowLoad(true), 8000);

    // Hace UN intento de fetch con timeout duro de 25s.
    const attempt = async (): Promise<Response> => {
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 25000);
      try {
        return await fetch('/api/facturas', {
          cache: 'no-store',
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(killer);
      }
    };

    let res: Response;
    try {
      try {
        res = await attempt();
      } catch (firstErr) {
        // Retry una vez en caso de network error / abort (cubre cold start
        // de Vercel donde la primera invocación puede 504 si el Sheet es grande).
        console.warn('[facturas] primer intento falló, reintentando…', firstErr);
        res = await attempt();
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg =
          data?.error || `Error ${res.status} cargando facturas`;
        console.error('[facturas] respuesta no OK', { status: res.status, data });
        setError(msg);
        return;
      }

      const rawRows = (data.facturas || []) as Array<
        Record<string, string | number | undefined>
      >;
      // _sheetRow llega como number; lo convertimos a string para que el
      // tipo Factura sea coherente con su index signature.
      const withIds: Factura[] = rawRows.map((r, i) => {
        const out: Factura = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = v === undefined || v === null ? '' : String(v);
        }
        out._id = String(r._sheetRow ?? i);
        return out;
      });
      setFacturas(withIds);
    } catch (err) {
      console.error('[facturas] error de red/timeout', err);
      setError('Error de conexión — tocá Actualizar para reintentar.');
    } finally {
      clearTimeout(slowTimer);
      setSlowLoad(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const marcarPagada = useCallback(
    async (f: Factura): Promise<WriteOpResult> => {
      const filaExacta = f._sheetRow ? parseInt(f._sheetRow, 10) || null : null;
      if (!filaExacta) {
        return { ok: false, error: 'Esta factura no tiene fila exacta en el Sheet (recargá).' };
      }
      try {
        const res = await fetch('/api/factura/marcar-pagada', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filaExacta }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!res.ok || !data?.ok) {
          return {
            ok: false,
            error: data?.error || `Error ${res.status} marcando pagada`,
          };
        }
        await refresh();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Error de red',
        };
      }
    },
    [refresh],
  );

  const eliminarFactura = useCallback(
    async (f: Factura): Promise<WriteOpResult> => {
      const filaExacta = f._sheetRow ? parseInt(f._sheetRow, 10) || null : null;
      if (!filaExacta) {
        return { ok: false, error: 'Esta factura no tiene fila exacta en el Sheet (recargá).' };
      }
      try {
        const res = await fetch('/api/factura/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filaExacta }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!res.ok || !data?.ok) {
          return {
            ok: false,
            error: data?.error || `Error ${res.status} eliminando`,
          };
        }
        await refresh();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Error de red',
        };
      }
    },
    [refresh],
  );

  const actualizarMedioPago = useCallback(
    async (f: Factura, medio: string): Promise<WriteOpResult> => {
      const filaExacta = f._sheetRow ? parseInt(f._sheetRow, 10) || null : null;
      if (!filaExacta) {
        return { ok: false, error: 'Esta factura no tiene fila exacta en el Sheet (recargá).' };
      }
      try {
        const res = await fetch('/api/factura/medio-pago', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filaExacta, medioPago: medio }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!res.ok || !data?.ok) {
          return {
            ok: false,
            error: data?.error || `Error ${res.status} actualizando medio de pago`,
          };
        }
        await refresh();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Error de red',
        };
      }
    },
    [refresh],
  );

  const { pendingCount, totalPending } = useMemo(() => {
    const pend = facturas.filter(esAPagar);
    return {
      pendingCount: pend.length,
      totalPending: pend.reduce((s, f) => s + parseNum(f[COL.total]), 0),
    };
  }, [facturas]);

  const value: StoreValue = {
    facturas,
    loading,
    slowLoad,
    error,
    refresh,
    pendingCount,
    totalPending,
    marcarPagada,
    eliminarFactura,
    actualizarMedioPago,
  };

  return <FacturasContext.Provider value={value}>{children}</FacturasContext.Provider>;
}
