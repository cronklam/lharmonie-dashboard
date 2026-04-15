# CLAUDE.md — Lharmonie Dashboard (Facturas)

> **OBLIGATORIO:** Leer este archivo COMPLETO antes de tocar cualquier
> archivo del repo. Sin excepciones.

---

## Que es este proyecto

Dashboard web para visualizar las facturas de Lharmonie. Lee datos del
Google Sheet de Facturas (que el bot de Telegram llena) y los muestra
en una interfaz web con filtros, busqueda, y detalle por factura.

**URL:** `lharmonie-dashboard.vercel.app`
**Repo:** `cronklam/lharmonie-dashboard`
**Deploy:** Vercel

**Dueno:** Martin Masri (martin.a.masri@gmail.com).
**Nombre:** siempre "Lharmonie" (sin apostrofe). Nunca "L'Harmonie".

---

## Estructura del repo

```
cronklam/lharmonie-dashboard/
├── dash/                ← Carpeta principal de la app
│   ├── app.js           ← Archivo principal
│   └── ...
├── CLAUDE.md            ← ESTE ARCHIVO
└── ...
```

---

## Como correrlo / deployarlo

### Deploy: Vercel
- Proyecto: `lharmonie-dashboard` en org `cronklam-8365s-projects`
- URL: `lharmonie-dashboard.vercel.app`
- Auto-deploy desde branch `main` (push → deploy)

### Datos
- Lee del Google Sheet Facturas: `1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o`
- API Key para leer Sheet: `AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o`

---

## Diseno visual

| Elemento | Valor |
|----------|-------|
| Fondo | `#EDEBE4` |
| Header | `#C4A882` |
| Espresso (texto/acentos) | `#1A0F08` |
| Fuente titulo | Playfair Display |
| Fuente body | DM Sans |
| Layout | Mobile-first |

---

## Reglas que no se deben romper

1. **El dashboard es READ-ONLY.** Solo lee del Sheet, nunca escribe.
   El bot de Telegram es el unico que escribe facturas.
2. **Mobile-first.** Toda modificacion de UI debe funcionar bien en
   celular — Martin y el equipo lo usan desde el telefono.
3. **El Sheet de Facturas es la unica fuente de verdad.** No cachear
   datos localmente ni crear una DB paralela.

---

## Ideas ya descartadas

- Dashboard con edicion de facturas → el bot es el punto de entrada
- DB propia (SQLite/Postgres) → Sheet es suficiente por ahora
- Reportes comparativos del P&L en este dashboard → van a un dashboard
  Vercel separado alimentado por el pipeline P&L

---

## Bugs conocidos / estado actual

- [ ] **Verificar que el deploy en Vercel este actualizado** — no se ha
      confirmado la version deployada recientemente
- [ ] **Scroll iOS en panel detalle** — reportado como roto (puede ser
      compartido con el bot si comparten componentes)

---

## Lecciones aprendidas

1. **Vercel auto-deploys desde main.** Cada push a main dispara un deploy.
   Si el deploy falla, verificar en el dashboard de Vercel los logs.
2. **Google Sheets API tiene rate limits.** Si el dashboard hace muchas
   requests, puede recibir 429. Implementar cache con TTL si es necesario.

---

## Relacion con otros repos

- **lharmonie-bot** (`cronklam/lharmonie-bot`): El bot escribe al Sheet
  que este dashboard lee. Son complementarios.
- **lharmonie-pnl-upload** (`cronklam/lharmonie-pnl-upload`): El roadmap
  incluye un dashboard P&L separado que eventualmente puede integrarse
  o coexistir con este dashboard de facturas.
