// ─────────────────────────────────────────────────────────────────────────────
// Printable bilingual donation receipt (a standalone HTML page).
// ─────────────────────────────────────────────────────────────────────────────

import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { formatETB } from './types';
import { purposeLabel, type Donation } from './donations';

const TYPE_LABEL: Record<Donation['type'], string> = {
  CASH: 'በጥሬ ገንዘብ · Cash',
  BANK: 'በባንክ · Bank transfer',
  IN_KIND: 'በዓይነት · In kind',
};

/** Escape text placed into the receipt HTML. */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The Sunday school the receipt is from; "Church · School" names print on two lines. */
export interface ReceiptSchool {
  en: string;
  am: string;
  /** Absolute URL (the receipt opens in its own window) */
  logoUrl: string | null;
}

export function buildReceiptHtml(d: Donation, receivedBy: string, school: ReceiptSchool, autoPrint = true): string {
  const lines = (s: string) => s.split(' · ').map(esc).join('<br>');
  const date = d.received_on ?? d.pledged_on ?? d.created_at.slice(0, 10);
  const row = (label: string, value: string, cls = '') =>
    `<tr><th>${esc(label)}</th><td${cls ? ` class="${cls}"` : ''}>${esc(value)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.receipt_no)}</title>
<style>
  body{font-family:'Noto Sans Ethiopic','Nyala','Segoe UI',sans-serif;color:#0f172a;margin:40px;background:#fff}
  .box{border:2px solid #1e2770;border-radius:12px;padding:28px 32px;max-width:560px;margin:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  h1{font-size:17px;margin:0;color:#1e2770;line-height:1.35} h2{font-size:12.5px;margin:4px 0 0;font-weight:500;color:#475569}
  .school{display:flex;gap:12px;align-items:flex-start} .logo{width:52px;height:52px;object-fit:contain}
  .no{font-family:Consolas,monospace;font-size:14px;font-weight:700;white-space:nowrap;border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px}
  .kind{margin-top:14px;display:inline-block;font-size:12px;font-weight:600;color:#1e2770;background:#eef2ff;border-radius:999px;padding:3px 10px}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}
  th{text-align:left;color:#475569;font-weight:500;padding:9px 0;width:40%;border-bottom:1px solid #e2e8f0;vertical-align:top}
  td{padding:9px 0;border-bottom:1px solid #e2e8f0;font-weight:600}
  td.amount{font-size:22px}
  .thanks{margin-top:22px;font-size:13px;text-align:center;color:#334155}
  .sign{margin-top:44px;display:flex;justify-content:space-between;gap:24px;font-size:12px;color:#475569}
  .sign div{border-top:1px solid #94a3b8;padding-top:6px;flex:1}
  @media print{body{margin:0}.box{border-color:#000}}
</style></head><body><div class="box">
  <div class="top">
    <div class="school">
      ${school.logoUrl ? `<img src="${esc(school.logoUrl)}" alt="" class="logo">` : ''}
      <div>
        <h1>${lines(school.am)}</h1>
        <h2>${esc(school.en)}</h2>
      </div>
    </div>
    <span class="no">${esc(d.receipt_no)}</span>
  </div>
  <span class="kind">${d.status === 'PLEDGED' ? 'የስጦታ ቃል ማረጋገጫ · Pledge acknowledgement' : 'የስጦታ ደረሰኝ · Donation receipt'}</span>
  <table>
    ${row('ለጋሽ · Donor', d.donor_name)}
    ${d.donor_phone ? row('ስልክ · Phone', d.donor_phone) : ''}
    ${row('ዓይነት · Type', TYPE_LABEL[d.type])}
    ${d.type === 'IN_KIND' ? row('ዕቃዎች · Items', d.item_description) : ''}
    ${row('ዓላማ · Purpose', `${purposeLabel(d.purpose, 'am')} · ${d.purpose}`)}
    ${row(d.type === 'IN_KIND' ? 'የተገመተ ዋጋ · Estimated value' : 'መጠን · Amount', formatETB(d.amount), 'amount')}
    ${row('ቀን · Date', `${formatEthiopianDate(date, 'am')} (${date})`)}
  </table>
  <p class="thanks">እግዚአብሔር ይስጥልን — Thank you for your generosity.</p>
  <div class="sign"><div>የተቀበለው · Received by: ${esc(receivedBy)}</div><div>ፊርማና ማኅተም · Signature &amp; seal</div></div>
</div>${autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}</body></html>`;
}
