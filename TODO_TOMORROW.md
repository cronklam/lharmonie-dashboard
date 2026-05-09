# TODO — pendiente de tu lado para que Servicios + Caja + Baigun anden

> Esto se ejecutó en una sesión nocturna. El código entero está
> deployado pero los endpoints van a devolver error hasta que
> completes los pasos de abajo. **Cada paso es 1-2 min de trabajo.**

---

## Paso 1 — Compartir los Sheets con el service account

El JSON que tenés en `GOOGLE_CREDENTIALS` (el del staff app) tiene un
campo `client_email` que termina en `@xxx.iam.gserviceaccount.com`.
Buscalo y compartí los dos Sheets siguientes con ese email **como
Editor**:

- Caja: <https://docs.google.com/spreadsheets/d/1Vx2aOlbf79GKSL-LaZUBYiluWnqiCv3EWaVv1oEej1Q>
- Servicios: <https://docs.google.com/spreadsheets/d/1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM>

Si no recordás cuál es el email del service account, abrí el JSON
de `GOOGLE_CREDENTIALS` (en Vercel → Settings → Environment
variables) y copiá el `client_email`.

---

## Paso 2 — Setear las env vars en Vercel

En Vercel → project `lharmonie-dashboard` → Settings → Environment
variables. Agregá / verificá:

| Var | Valor |
|-----|-------|
| `GOOGLE_CREDENTIALS` | JSON del service account (mismo que staff) |
| `SERVICIOS_SHEET_ID` | `1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM` |
| `CAJA_SHEET_ID` | `1Vx2aOlbf79GKSL-LaZUBYiluWnqiCv3EWaVv1oEej1Q` |

Después redeploy (Vercel → Deployments → "..." → Redeploy).

---

## Paso 3 — Confirmar nombres de tabs

Los endpoints buscan tabs con estos nombres exactos. Si tu Sheet usa
otros nombres, **abrí cada Sheet y mirá los nombres reales**, después
agregá la env var correspondiente en Vercel para sobreescribir.

| Default (heredado del staff) | Variable de override |
|-------------------------------|----------------------|
| `Servicios Catalogo` | `SERVICIOS_CATALOGO_TAB` |
| `Servicios Pagos` | `SERVICIOS_PAGOS_TAB` |
| `Baigun CtaCte` | `BAIGUN_CTA_CTE_TAB` |
| `CajaChica_Movimientos` | `CAJA_CHICA_MOV_TAB` |
| `CajaChica_Sesiones` | `CAJA_CHICA_SES_TAB` |
| `CajaGrande_Movimientos` | `CAJA_GRANDE_TAB` |

**Si los tabs tienen nombres distintos a los defaults**, mandame los
nombres reales y los sumamos al `.env.local` y a Vercel.

---

## Paso 4 — Confirmar formato de columnas (CRÍTICO)

El código asume el orden de columnas exacto del staff. Si tus tabs
tienen menos columnas, otras columnas, u otro orden, **vamos a
desordenar la data** al escribir.

Pasame una **captura o copy-paste de la fila 1 (headers)** de cada
uno de los 6 tabs, así verifico que coincidan con los headers que
tengo en `lib/servicios.ts` y `lib/caja.ts`. Si no coinciden,
adaptamos un mapping de columnas en una sola pasada.

Headers esperados (consultar archivos para detalle):
- `Servicios Catalogo` → 23 columnas (`SERVICIOS_CATALOGO_HEADERS`)
- `Servicios Pagos` → 16 columnas (`SERVICIOS_PAGOS_HEADERS`)
- `Baigun CtaCte` → 8 columnas (`BAIGUN_CTA_CTE_HEADERS`)
- `CajaChica_Movimientos` → 14 columnas (`CAJA_CHICA_MOV_HEADERS`)
- `CajaChica_Sesiones` → 19 columnas (`CAJA_CHICA_SES_HEADERS`)
- `CajaGrande_Movimientos` → 10 columnas (`CAJA_GRANDE_HEADERS`)

---

## Paso 5 — Probar

Después de los pasos 1-3 (4 puede esperar a que veas la primera
escritura):

1. Abrí `/servicios` → debería listar lo que tengas en el tab. Si
   está vacío, vas a ver "Sin servicios cargados" y el botón "Crear
   primero".
2. Tap en "Nuevo servicio" → cargá uno → confirmá → revisá el Sheet.
   Si la fila quedó con campos en columnas equivocadas, eso responde
   el paso 4.
3. Repetí en `/caja` con un movimiento dummy chico (depósito de $1
   con concepto "test").

---

## Pendientes que quedan (no urgentes)

- **Sesiones de caja chica** (control cada 2 días estilo Iara) — UI
  no construida porque es flujo del cajero, no del management. Se
  agrega cuando lo pidas.
- **Calendario de servicios** (vista mensual con vencimientos por día)
  — el staff lo tiene, lo dejé fuera. Se suma cuando confirmes que
  el resto está estable.
- **Importar histórico** — el staff tiene un endpoint
  `/api/servicios/importar-historico`. No lo porté: requería
  decisiones de mapping. Si tenés un Sheet viejo de servicios para
  migrar, lo armamos cuando me lo pases.
- **Recategorizar / restore** — endpoints admin del staff. No
  necesarios en management dashboard hasta que algo falle.

---

## Ante cualquier error

Los endpoints devuelven errores con texto claro. Si ves "No se pudo
leer X. Verificá que el tab exista...", es paso 1 o 3. Si ves
"GOOGLE_CREDENTIALS no configurado", es paso 2. Si la fila escribe
data en columnas equivocadas, es paso 4.

Mandame screenshot del error y lo destrabo en 5 min.
