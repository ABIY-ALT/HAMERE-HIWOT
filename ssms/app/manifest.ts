import type { MetadataRoute } from 'next';

// Web app manifest — lets phones install the site, and is what the Android
// app (Trusted Web Activity) is built from.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'ሐመረ ሕይወት ሰንበት ት/ቤት — Hamere Hiwot',
    short_name: 'Hamere Hiwot',
    description: 'Sallo Debre Tsehay Saint George Church — Hamere Hiwot Sunday School management system',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e2770',
    lang: 'am',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
