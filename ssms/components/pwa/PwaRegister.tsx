'use client';

import { useEffect } from 'react';

/** Registers the service worker (push notifications + offline page). */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not fatal — the site works without it, just without push / offline page
      });
    }
  }, []);
  return null;
}
