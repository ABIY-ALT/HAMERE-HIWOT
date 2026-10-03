import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/pwa/PwaRegister';

export const viewport: Viewport = {
  themeColor: '#1e2770',
};

export const metadata: Metadata = {
  // One name on every page (browser tab, bookmarks, home-screen shortcut)
  title: 'ሐመረ ሕይወት — Hamere Hiwot',
  description:
    'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን ሐመረ ሕይወት ሰንበት ትምህርት ቤት አስተዳደር መረጃ ስርዓት — Sallo Debre Tsehay Saint George Church Hamere Hiwot Sabbath School MIS',
  keywords: [
    'Hamere Hiwot',
    'ሐመረ ሕይወት',
    'ሳሎ ደብረ ፀሐይ',
    'Sunday School',
    'Church MIS',
    'Ethiopian Orthodox',
    'ሰንበት ት/ቤት',
  ],
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Hamere Hiwot', statusBarStyle: 'default' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
