import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './components/AuthProvider';
import { TopNav } from './components/TopNav';
import { BottomNav } from './components/BottomNav';
import { ServiceWorkerRegister } from './components/ServiceWorkerRegister';

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
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta
          name="google-client-id"
          content={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}
        />
      </head>
      <body>
        <ServiceWorkerRegister />
        <AuthProvider>
          <TopNav />
          <main className="lh-page">{children}</main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
