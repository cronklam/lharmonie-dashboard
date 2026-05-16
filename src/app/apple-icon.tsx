import { ImageResponse } from 'next/og';

// Apple Touch Icon. iOS NO usa maskable, lo muestra como un cuadrado
// con bordes redondeados aplicados por el sistema (squircle ~22%).
// Por eso este icon usa el espacio entero — diferente del icon.tsx
// genérico que reserva safe zone para masking.
//
// Diseño: fondo negro espresso + L dorada + pill "MANAGEMENT" debajo
// (firma del dashboard, lo distingue del staff app).

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(circle at 35% 25%, #2A1810 0%, #1E1512 38%, #0D0805 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Glow dorado */}
        <div
          style={{
            position: 'absolute',
            width: 130,
            height: 130,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(196,160,103,0.30) 0%, transparent 65%)',
            top: 18,
            display: 'flex',
          }}
        />
        {/* L dorada */}
        <div
          style={{
            fontSize: 128,
            fontFamily: 'Georgia, serif',
            fontWeight: 500,
            color: '#C4A067',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            display: 'flex',
            marginTop: 6,
          }}
        >
          L
        </div>
        {/* Pill MANAGEMENT */}
        <div
          style={{
            fontSize: 11,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: 700,
            color: '#C4A067',
            letterSpacing: '0.22em',
            marginTop: 10,
            padding: '3px 10px',
            border: '1px solid rgba(196,160,103,0.45)',
            borderRadius: 999,
            display: 'flex',
          }}
        >
          MGMT
        </div>
      </div>
    ),
    { ...size },
  );
}
