import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './components/AuthProvider';
import { FacturasProvider } from './components/FacturasStore';
import { TopNav } from './components/TopNav';
import { BottomNav } from './components/BottomNav';
import { ServiceWorkerRegister } from './components/ServiceWorkerRegister';
import { LogoMorphMount } from './components/LogoMorphMount';

export const metadata: Metadata = {
  title: 'Lharmonie — Management',
  description: 'Dashboard privado de management — Lharmonie',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lharmonie',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0D0805',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Recoleta-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta
          name="google-client-id"
          content={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <AuthProvider>
          <FacturasProvider>
            <TopNav />
            <main className="flex-1 pb-nav-safe">{children}</main>
            <BottomNav />
          </FacturasProvider>
          <LogoMorphMount />
        </AuthProvider>
      </body>
    </html>
  );
}
