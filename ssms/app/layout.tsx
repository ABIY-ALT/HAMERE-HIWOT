import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | ሐመረ ሕይወት ሰንበት ት/ቤት — SSMS',
    default: 'ሐመረ ሕይወት ሰንበት ት/ቤት (Hamere Hiwot) — SSMS',
  },
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
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
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
      </body>
    </html>
  );
}
