'use client';

// A QR code drawn as SVG (the qrcode package), for member cards and certificates.

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size, className = '' }: { value: string; size: number; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <span
      className={`inline-block [&>svg]:w-full [&>svg]:h-full ${className}`}
      style={{ width: size, height: size }}
      // Made by the qrcode package from the value — no outside markup
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
