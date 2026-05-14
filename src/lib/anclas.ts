// Anclas — taxonomía transversal para clasificar todo gasto
// (servicios, caja chica, etc) por unidad de negocio.
//
// Espejo del staff (`~/Desktop/lharmonie-staff/src/lib/servicios.ts`):
// - LH1..LH6 → locales físicos
// - CRONKLAM → empresa (gastos corporativos / impositivos sin local)
// - MyP     → personal de los dueños (NO entra en métricas op)
// - BAMBINA → propiedad personal con servicios (Telecom/Flow, Aysa,
//   ABL, Edenor, Expensas). Hasta mayo 2026 los movimientos de la
//   col BAMBINA del pivot se agrupaban bajo CRONKLAM; ahora es ancla
//   propia para distinguir gastos corporativos de personales.

export type Ancla =
  | 'LH1'
  | 'LH2'
  | 'LH3'
  | 'LH4'
  | 'LH5'
  | 'LH6'
  | 'CRONKLAM'
  | 'BAMBINA'
  | 'MyP';

export const ANCLAS: Ancla[] = [
  'LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6', 'CRONKLAM', 'BAMBINA', 'MyP',
];

export const ANCLA_LABELS: Record<Ancla, string> = {
  LH1: 'Lharmonie 1 (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie 6 (LH6)',
  CRONKLAM: 'Cronklam (empresa)',
  BAMBINA: 'Bambina (personal)',
  MyP: 'Martín y Melanie (personal)',
};

export const ANCLA_SHORT: Record<Ancla, string> = {
  LH1: 'LH1',
  LH2: 'LH2 Nicaragua',
  LH3: 'LH3 Casa',
  LH4: 'LH4 Zabala',
  LH5: 'LH5 Libertador',
  LH6: 'LH6',
  CRONKLAM: 'Cronklam',
  BAMBINA: 'Bambina',
  MyP: 'M&P',
};

export function isAncla(x: string | undefined | null): x is Ancla {
  if (!x) return false;
  return (ANCLAS as string[]).includes(x);
}

/** Bridge: el Sheet de Facturas trae `Local` con strings tipo "Lharmonie 1"
 *  o "Casa Lharmonie". Mapeamos a Ancla cuando podemos. */
export function inferAnclaFromLocal(local: string | undefined | null): Ancla | null {
  if (!local) return null;
  const s = local.toLowerCase().trim();
  if (s.includes('nicaragua') || s.includes('lh2')) return 'LH2';
  if (s.includes('casa') || s.includes('lh3')) return 'LH3';
  if (s.includes('zabala') || s.includes('lh4')) return 'LH4';
  if (s.includes('libertador') || s.includes('lh5')) return 'LH5';
  if (s.includes('lh6')) return 'LH6';
  if (s.includes('lh1') || /\b1\b/.test(s)) return 'LH1';
  return null;
}
