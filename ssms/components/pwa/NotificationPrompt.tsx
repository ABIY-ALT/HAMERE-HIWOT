'use client';

// Asks once (then again after a week if postponed) to turn on notifications,
// and keeps this device's push subscription saved for the signed-in user.
// In the Android app the "Allow" goes straight to Android's own permission
// dialog; the app also asks on its first launch.

import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { getPushPublicKey, removePushSubscription, savePushSubscription } from '@/lib/push/actions';

const SNOOZE_KEY = 'ssms_push_prompt_snoozed';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Subscribes this device (or reuses its subscription) and saves it for the signed-in user. */
async function subscribe(publicKey: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // A subscription made with an older key can't be reused
    const current = sub.options.applicationServerKey;
    const wanted = keyBytes(publicKey);
    const same = current && new Uint8Array(current).every((b, i) => b === wanted[i]);
    if (!same) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const res = await savePushSubscription(sub.toJSON());
  return res.ok;
}

/** On sign-out: stop sending this user's notifications to this device. */
export async function forgetThisDevice(): Promise<void> {
  if (!supported()) return;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await removePushSubscription(sub.endpoint);
  } catch {
    // Signing out must not fail because of this
  }
}

export default function NotificationPrompt() {
  const { t } = useLang();
  const { user } = useAuth();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supported() || !user) return;
    let cancelled = false;
    getPushPublicKey()
      .then(async (key) => {
        if (cancelled || !key) return;
        setPublicKey(key);
        if (Notification.permission === 'granted') {
          // Already allowed (e.g. on the app's first launch): just make sure this device is saved
          await subscribe(key).catch(() => false);
        } else if (Notification.permission === 'default') {
          let snoozed = 0;
          try {
            snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
          } catch {
            // storage unavailable — ask again
          }
          if (Date.now() - snoozed > WEEK) setShow(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const allow = async () => {
    if (!publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const ok = await subscribe(publicKey);
        if (ok) {
          setShow(false);
          return;
        }
        setMessage(t('Notifications are allowed, but this device could not be registered. Try again later.', 'ማሳወቂያ ተፈቅዷል፣ ግን መሣሪያው መመዝገብ አልቻለም። ቆይተው ይሞክሩ።'));
      } else {
        setShow(false);
      }
    } catch {
      setMessage(t('Could not turn on notifications on this device.', 'በዚህ መሣሪያ ማሳወቂያ ማብራት አልተቻለም።'));
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // storage unavailable — the prompt may show again next time
    }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div className="fixed z-40 bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4" role="dialog" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
          <BellRing size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900">{t('Turn on notifications?', 'ማሳወቂያ ይብራ?')}</div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {t(
              'Get a message on this phone when something needs you — a payment request to approve, a decision on your request, grades to approve.',
              'ትኩረትዎን የሚሻ ነገር ሲኖር በዚህ ስልክ መልእክት ይደርስዎታል — ማጽደቅ የሚጠብቅ የክፍያ ጥያቄ፣ በጥያቄዎ ላይ የተሰጠ ውሳኔ፣ ማጽደቅ የሚጠብቁ ውጤቶች።'
            )}
          </p>
          {message && <p className="text-xs text-red-600 mt-2">{message}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={allow} disabled={busy} className="btn btn-primary text-xs py-1.5 px-3 disabled:opacity-60">
              {busy ? t('Turning on…', 'በማብራት ላይ…') : t('Allow', 'ፍቀድ')}
            </button>
            <button onClick={later} className="btn btn-secondary text-xs py-1.5 px-3">{t('Not now', 'አሁን አይደለም')}</button>
          </div>
        </div>
        <button onClick={later} aria-label={t('Close', 'ዝጋ')} className="text-slate-400 hover:text-slate-600 p-1 -m-1">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
