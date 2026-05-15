import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';

// Endpoint temporal de diagnóstico. Devuelve crudo lo que viene del
// Sheets API para que podamos ver headers + primeras filas y
// entender por qué algunas facturas no se muestran.
//
// BORRAR este archivo después de diagnosticar.
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const SHEET_ID = process.env.FACTURAS_SHEET_ID || '';
  const API_KEY = process.env.GOOGLE_API_KEY || '';
  if (!SHEET_ID || !API_KEY) {
    return NextResponse.json({ ok: false, error: 'env faltante' }, { status: 500 });
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    'Facturas',
  )}?key=${API_KEY}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Sheets API ${res.status}` },
      { status: 500 },
    );
  }
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values || [];

  // Re-corrermos rowsToObjects internamente
  let hi = 0;
  if (rows[0]?.[0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) {
    hi = 1;
  }
  const headers = rows[hi]?.map((h) => String(h).trim()) || [];
  const firstDataRow = rows[hi + 1] || [];

  // Filas con Estado = "A pagar" cualquier variante
  let countAPagar = 0;
  let sampleAPagar: { row: number; estado: string; total: string; proveedor: string } | null = null;
  // El idx de la col Estado en los headers detectados
  const idxEstado = headers.findIndex((h) => h === 'Estado');
  const idxTotal = headers.findIndex((h) => h === 'Total');
  const idxProveedor = headers.findIndex((h) => h === 'Proveedor');
  if (idxEstado >= 0) {
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const e = (r[idxEstado] || '').toLowerCase();
      if (e.includes('a pagar') || e.includes('pagar')) {
        countAPagar++;
        if (!sampleAPagar) {
          sampleAPagar = {
            row: i + 1,
            estado: r[idxEstado] || '',
            total: r[idxTotal] || '',
            proveedor: r[idxProveedor] || '',
          };
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    totalRows: rows.length,
    hiDetectado: hi,
    row0_first5cols: rows[0]?.slice(0, 5) || [],
    row1_first5cols: rows[1]?.slice(0, 5) || [],
    row2_first5cols: rows[2]?.slice(0, 5) || [],
    headersDetectados: headers,
    headersCount: headers.length,
    firstDataRow_first5cols: firstDataRow.slice(0, 5),
    idxEstado,
    idxTotal,
    idxProveedor,
    countAPagar,
    sampleAPagar,
    estadoSampleValues: Array.from(
      new Set(
        rows
          .slice(hi + 1, hi + 200)
          .map((r) => (r[idxEstado] || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 30),
  });
});
