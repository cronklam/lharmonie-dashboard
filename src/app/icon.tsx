import { ImageResponse } from 'next/og';

// PWA icon (maskable). Next.js App Router lo sirve en /icon
// automáticamente y lo wirea al <head>.
//
// Diseño: fondo negro espresso (matchea el theme_color y el TopNav del
// dashboard), L dorada grande centrada en Recoleta-style serif. La
// L ocupa ~50% del cuadrado, dejando 25% de safe zone a cada lado —
// requisito para "maskable": iOS/Android recortan a círculo/squircle
// y todo el contenido visible tiene que estar en ese 60% central.

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(circle at 35% 25%, #2A1810 0%, #1E1512 35%, #0D0805 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Glow dorado sutil detrás de la L */}
        <div
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(196,160,103,0.28) 0%, transparent 65%)',
            display: 'flex',
          }}
        />
        {/* Serif "L" dorada centrada */}
        <div
          style={{
            fontSize: 360,
            fontFamily: 'Georgia, serif',
            fontWeight: 500,
            color: '#C4A067',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            display: 'flex',
            // Compensación visual: la L queda ópticamente alta porque
            // el peso visual está en la base, no en el cuerpo.
            transform: 'translateY(-8px)',
          }}
        >
          L
        </div>
      </div>
    ),
    { ...size },
  );
}
