'use client';

// Reading QR codes with the phone or laptop camera: member cards, the "My QR"
// people show from the bot or the website, and event tickets.
// • The browser's own barcode reader where there is one (Chrome, Edge,
//   Android); everywhere else (iPhone Safari, Firefox) the jsqr library reads
//   the camera frames instead.
// • QrScanButton: one code, then the camera closes (search boxes).
// • QrScanner continuous: stays open for a queue at the door — each new code
//   is handed over once, the same code again only after a few seconds.

import React, { useEffect, useRef, useState } from 'react';
import { QrCode as QrIcon, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

/** The same code is not handed over again within this time (continuous mode) */
const REPEAT_MS = 4000;
const FRAME_MS = 250;

export function QrScanButton({ onScan, className = '' }: { onScan: (value: string) => void; className?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn btn-secondary text-xs inline-flex items-center gap-1.5 ${className}`}>
        <QrIcon size={14} /> {t('Scan card', 'ካርድ ቃኝ')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800">{t('Hold the QR code to the camera', 'የQR ኮዱን ወደ ካሜራው ያቅርቡ')}</span>
              <button onClick={() => setOpen(false)} aria-label={t('Close', 'ዝጋ')} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <QrScanner
              onScan={(v) => {
                setOpen(false);
                onScan(v);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** The camera view. `continuous`: keeps reading after each code. */
export function QrScanner({ onScan, continuous = false, className = '' }: { onScan: (value: string) => void; continuous?: boolean; className?: string }) {
  const { t } = useLang();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState('');
  const cameraProblem = t('The camera could not be opened — allow camera access and try again (the page must be opened over https).', 'ካሜራው አልተከፈተም — ለካሜራ ፈቃድ ሰጥተው እንደገና ይሞክሩ (ገጹ በ https መከፈት አለበት)።');
  // The camera opens once; the latest handler and wording are read through refs
  const latest = useRef({ onScan, cameraProblem, continuous });
  useEffect(() => {
    latest.current = { onScan, cameraProblem, continuous };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let last = { value: '', at: 0 };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    let jsQR: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;

    const read = async (v: HTMLVideoElement): Promise<string | undefined> => {
      if (native) return (await native.detect(v))[0]?.rawValue;
      if (!jsQR || !ctx || !v.videoWidth) return undefined;
      // A smaller frame reads fast enough on a phone
      const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height)?.data;
    };

    const loop = async () => {
      if (stopped || !video.current) return;
      try {
        const value = (await read(video.current))?.trim();
        const now = Date.now();
        if (value && (value !== last.value || now - last.at > REPEAT_MS)) {
          last = { value, at: now };
          latest.current.onScan(value);
          if (!latest.current.continuous) return;
        }
      } catch {
        // a frame that could not be read — try the next
      }
      timer = setTimeout(loop, FRAME_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
      if (!native) jsQR = (await import('jsqr')).default;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      void loop();
    })().catch(() => {
      if (!stopped) setProblem(latest.current.cameraProblem);
    });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (problem) return <p className={`p-5 text-sm text-slate-600 ${className}`}>{problem}</p>;
  return <video ref={video} playsInline muted className={`w-full aspect-square object-cover bg-black ${className}`} />;
}
