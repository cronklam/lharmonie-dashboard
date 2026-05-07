import 'server-only';

// Cliente del worker Railway que escribe al Sheet de Facturas.
// El dashboard solo expone "Marcar como pagada" como write — todo
// pasa por este worker (mismo flow que el dash viejo).

const WORKER_URL = process.env.WORKER_URL || 'https://worker-production-7f89.up.railway.app';
const API_SECRET = process.env.API_SECRET || '';

export interface MarcarPagadaPayload {
  nroFactura: string;
  proveedor: string;
  fecha: string;
  filaExacta: number | null;
}

export async function markFacturaPagada(payload: MarcarPagadaPayload): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!API_SECRET) {
    return { ok: false, status: 500, message: 'API_SECRET no configurado' };
  }
  const fechaPago = new Date().toLocaleDateString('es-AR');
  try {
    const res = await fetch(`${WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': API_SECRET,
      },
      body: JSON.stringify({ ...payload, fechaPago }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true, status: res.status };
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {}
    return { ok: false, status: res.status, message };
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: e instanceof Error ? e.message : 'fetch failed',
    };
  }
}
