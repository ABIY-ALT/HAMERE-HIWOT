// Creates the VAPID key pair push notifications need and adds it to
// .env.local. Run once: npm run setup-push
// The private key is written to the file only — never printed.

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import webpush from 'web-push';

const FILE = '.env.local';
const text = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
const has = (name) => new RegExp(`^${name}=.+`, 'm').test(text);

if (has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY')) {
  console.log('Push keys are already in .env.local — nothing changed.');
} else {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const lines = [
    '',
    '# Push notifications (npm run setup-push)',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    'VAPID_SUBJECT=https://hamere-hiwot.onrender.com',
    '',
  ];
  appendFileSync(FILE, (text && !text.endsWith('\n') ? '\n' : '') + lines.join('\n'));
  console.log('Added VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to .env.local.');
}
console.log('');
console.log('Next: copy those three lines from .env.local into Render → your service → Environment,');
console.log('then restart your local dev server. Keep VAPID_PRIVATE_KEY secret.');
