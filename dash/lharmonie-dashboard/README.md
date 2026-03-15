# Lharmonie Dashboard

Sistema de gestión de facturas — Cronklam SRL

## Stack

- HTML + CSS + JS vanilla (sin frameworks, zero dependencias)
- Google Sheets API v4 como base de datos
- Deploy en Vercel (static)

## Estructura

```
lharmonie-dashboard/
├── dash/
│   ├── index.html   ← app principal
│   ├── style.css    ← identidad visual Lharmonie
│   └── app.js       ← lógica y conexión a Sheets
└── vercel.json      ← configuración de deploy
```

## Configuración

Las variables están en `dash/app.js` en el objeto `CONFIG`:

```js
const CONFIG = {
  SHEET_ID: '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:  'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS: {
    facturas:    'Facturas',
    articulos:   'Artículos',
    proveedores: 'Proveedores',
  },
};
```

## Usuarios

| Usuario  | Contraseña | Rol           |
|----------|-----------|---------------|
| martin   | 0706      | Administrador |
| melanie  | 2607      | Gestión       |
| iara     | 3611      | Gestión       |

## Deploy

### Vercel (automático desde GitHub)

1. Conectar repo `cronklam/lharmonie-dashboard` en vercel.com
2. Vercel detecta `vercel.json` y sirve la carpeta `dash/`
3. Cada push a `main` redeploya automáticamente

### Manual

```bash
git add .
git commit -m "feat: rediseño dashboard identidad Lharmonie"
git push origin main
```

## Google Sheets — Permisos necesarios

El Sheet debe estar configurado como **"Cualquier persona con el enlace puede ver"**
para que la API Key pública funcione sin OAuth.

Verificar en: Google Sheets → Compartir → Acceso general → "Cualquier persona con el enlace"

## Pestañas del Sheet

| Pestaña      | Contenido                    |
|-------------|------------------------------|
| Facturas    | Registros del bot de Telegram |
| Artículos   | Items de facturas             |
| Proveedores | Proveedores registrados       |

La primera fila de cada pestaña debe contener los nombres de columna.
El dashboard detecta automáticamente las columnas disponibles.
