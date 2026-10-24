'use client';

// "Scan card": reads a member card's QR code with the phone or laptop camera
// (the browser's own barcode reader — Chrome and Edge on Android, Chrome on
// computers) and hands back what it holds. Where the browser has no reader,
// it says so: the code can be typed instead.

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

export function QrScanButton({ onScan, className = '' }: { onScan: (value: string) => void; className?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn btn-secondary text-xs inline-flex items-center gap-1.5 ${className}`}>
        <QrIcon size={14} /> {t('Scan card', 'ካርድ ቃኝ')}
      </button>
      {open && (
        <Scanner
          onClose={() => setOpen(false)}
          onScan={(v) => {
            setOpen(false);
            onScan(v);
          }}
        />
      )}
    </>
  );
}

function Scanner({ onClose, onScan }: { onClose: () => void; onScan: (value: string) => void }) {
  const { t } = useLang();
  const video = useRef<HTMLVideoElement>(null);
  const supported = typeof window !== 'undefined' && Boolean(window.BarcodeDetector);
  const [problem, setProblem] = useState(
    supported ? '' : t('This browser cannot read QR codes — type the code instead (or use Chrome on Android).', 'ይህ መቃኛ QR ኮድ ማንበብ አይችልም — ኮዱን ይጻፉ (ወይም በአንድሮይድ Chrome ይጠቀሙ)።')
  );
  const cameraProblem = t('The camera could not be opened — allow camera access and try again.', 'ካሜራው አልተከፈተም — ለካሜራ ፈቃድ ሰጥተው እንደገና ይሞክሩ።');
  // The camera opens once; the latest handler and wording are read through refs
  const latest = useRef({ onScan, cameraProblem });
  useEffect(() => {
    latest.current = { onScan, cameraProblem };
  });

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        timer = setInterval(async () => {
          if (done || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const value = found[0]?.rawValue?.trim();
            if (value) {
              done = true;
              latest.current.onScan(value);
            }
          } catch {
            // a frame that could not be read — try the next
          }
        }, 300);
      })
      .catch(() => setProblem(latest.current.cameraProblem));
    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [supported]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-800">{t('Hold the card’s QR code to the camera', 'የካርዱን QR ኮድ ወደ ካሜራው ያቅርቡ')}</span>
          <button onClick={onClose} aria-label={t('Close', 'ዝጋ')} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        {problem ? (
          <p className="p-5 text-sm text-slate-600">{problem}</p>
        ) : (
          <video ref={video} playsInline muted className="w-full aspect-square object-cover bg-black" />
        )}
      </div>
    </div>
  );
}
