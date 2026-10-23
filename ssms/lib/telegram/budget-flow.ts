// ─────────────────────────────────────────────────────────────────────────────
// "💰 Budget request" in the Telegram bot — server only. Only department heads
// (DEPT_HEAD of a department, COORDINATOR of a coordination — lib/organization
// HEAD_ROLE) whose role may submit payment requests (FINANCE_REQUEST) see the
// button. They see their latest requests and their status, and can ask Finance
// for money for the unit they head — the same payment request as on the
// website (Finance → Payment requests), with the unit's budget left shown
// before sending. Finance approvers are told at once (push + Telegram). Steps,
// kept in telegram_sessions:
//   BUDGET_MENU      latest requests · ➕ new request
//   BUDGET_UNIT      which unit (only when heading several)
//   BUDGET_CATEGORY  what for (the expense categories)
//   BUDGET_TITLE     a short title
//   BUDGET_AMOUNT    how much — the unit's budget left is shown
//   BUDGET_REASON    why
//   BUDGET_PRIORITY  normal / high / urgent / low
//   BUDGET_CONFIRM   send
// Sending checks again that the person still heads the unit.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram, siteUrl } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { heldPermissions } from '@/lib/auth/grant';
import { computeBudget, loadYears } from '@/lib/finance/budget';
import { EXPENSE_CATEGORIES, budgetRemaining, formatETB, type RequestStatus } from '@/lib/finance/types';
import { HEAD_ROLE, type UnitKind } from '@/lib/organization/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { notifyLater } from '@/lib/push/send';

const e = escapeHtml;
const NEW = '➕ አዲስ ጥያቄ · New request';
const SEND = '✅ ላክ · Send';
const PRIORITIES: [string, 'NORMAL' | 'HIGH' | 'URGENT' | 'LOW'][] = [
  ['መደበኛ · Normal', 'NORMAL'],
  ['ከፍተኛ · High', 'HIGH'],
  ['አስቸኳይ · Urgent', 'URGENT'],
  ['ዝቅተኛ · Low', 'LOW'],
];
const categoryButton = ([en, am]: [string, string]) => `${am} · ${en}`;

const STATUS: Record<RequestStatus, string> = {
  PENDING: '⏳ ማጽደቅ ይጠብቃል · waiting for approval',
  APPROVED: '✅ ጸድቋል · approved — waiting for payment',
  RETURNED: '↩️ ለማስተካከያ ተመልሷል · returned for changes',
  REJECTED: '❌ አልጸደቀም · not approved',
  COMPLETED: '💵 ተከፍሏል · paid',
  CANCELLED: '🚫 ተሰርዟል · cancelled',
};

/** A unit this chat's person heads, through one of their accounts */
export interface HeadUnit {
  user_id: string;
  unit_id: string;
  name_en: string;
  name_am: string;
}

type Step = 'BUDGET_MENU' | 'BUDGET_UNIT' | 'BUDGET_CATEGORY' | 'BUDGET_TITLE' | 'BUDGET_AMOUNT' | 'BUDGET_REASON' | 'BUDGET_PRIORITY' | 'BUDGET_CONFIRM';
export interface BudgetData {
  units?: HeadUnit[];
  unit?: HeadUnit;
  category?: string;
  title?: string;
  amount?: number;
  justification?: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT' | 'LOW';
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });
const pairs = (items: string[]) => items.reduce<string[][]>((rows, x, i) => (i % 2 ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

async function save(db: SupabaseClient, chatId: number, step: Step, data: BudgetData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/**
 * The units these people head (active, unexpired head-role assignments on
 * active units). Used for the menu: one query, run with the chat scope.
 */
export async function headUnitsOf(db: SupabaseClient, personIds: string[]): Promise<HeadUnit[]> {
  if (personIds.length === 0) return [];
  const { data, error } = await db
    .from('system_users')
    .select('id, assignments:user_unit_assignments!user_unit_assignments_system_user_id_fkey(is_active, expires_at, role:roles(code), unit:organization_units(id, name_en, name_am, unit_type, is_active))')
    .in('person_id', personIds)
    .eq('is_active', true);
  if (error) return [];
  const now = Date.now();
  const out: HeadUnit[] = [];
  for (const u of (data ?? []) as unknown as {
    id: string;
    assignments: { is_active: boolean; expires_at: string | null; role: { code: string } | null; unit: { id: string; name_en: string; name_am: string | null; unit_type: string; is_active: boolean } | null }[];
  }[]) {
    for (const a of u.assignments ?? []) {
      if (!a.is_active || (a.expires_at && Date.parse(a.expires_at) <= now) || !a.unit?.is_active) continue;
      if (a.role?.code !== HEAD_ROLE[a.unit.unit_type as UnitKind]) continue;
      if (out.some((x) => x.unit_id === a.unit!.id)) continue;
      out.push({ user_id: u.id, unit_id: a.unit.id, name_en: a.unit.name_en, name_am: a.unit.name_am || a.unit.name_en });
    }
  }
  return out;
}

/** Of the units headed, those whose account may submit payment requests. */
async function requestableUnits(db: SupabaseClient, scope: ChatScope): Promise<HeadUnit[]> {
  const heads = await headUnitsOf(db, scope.memberPersonIds);
  const users = [...new Set(heads.map((h) => h.user_id))];
  const allowed = new Set<string>();
  for (const id of users) {
    const held = await heldPermissions(db, id).catch(() => new Set<string>());
    if (held.has('FINANCE_REQUEST') || held.has('FINANCE_CREATE')) allowed.add(id);
  }
  return heads.filter((h) => allowed.has(h.user_id));
}

const unitButton = (u: HeadUnit) => `🏢 ${u.name_am}${u.name_am !== u.name_en ? ` · ${u.name_en}` : ''}`;

/** "💰 Budget request": the latest requests of the units headed, and "➕ New request". */
export async function startBudget(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>, enabled: boolean) {
  if (!enabled) return sendTelegram(chatId, e('የበጀት ጥያቄ አሁን አይገኝም። · Budget requests are not available now.'), menu);
  const units = await requestableUnits(db, scope);
  if (units.length === 0) {
    return sendTelegram(
      chatId,
      e(
        scope.headUnits.length
          ? 'ሚናዎ የክፍያ ጥያቄ እንዲያቀርብ አልተፈቀደለትም — አስተዳዳሪውን ይጠይቁ። · Your role may not send payment requests — ask the administrator.'
          : 'የበጀት ጥያቄ የሚያቀርቡት የክፍል ኃላፊዎች ብቻ ናቸው። · Only department heads can send budget requests.'
      ),
      menu
    );
  }
  const { data } = await db.from('finance_requests')
    .select('request_no, title, amount, status, review_note, created_at')
    .in('organization_unit_id', units.map((u) => u.unit_id))
    .order('created_at', { ascending: false })
    .limit(5);
  const recent = (data ?? []) as { request_no: string; title: string; amount: number; status: RequestStatus; review_note: string | null; created_at: string }[];

  const lines = ['💰 <b>የበጀት ጥያቄ · Budget request</b>', e(units.map((u) => u.name_am).join('፣ ')), ''];
  if (recent.length) {
    lines.push(e('የቅርብ ጊዜ ጥያቄዎች · Latest requests:'));
    for (const r of recent) {
      lines.push(`🔹 <b>${e(r.request_no)}</b> ${e(r.title)} — ${e(formatETB(Number(r.amount)))}`);
      lines.push(e(`    ${formatEthiopianDate(r.created_at.slice(0, 10), 'am')} · ${STATUS[r.status] ?? r.status}`));
      if (r.review_note && (r.status === 'RETURNED' || r.status === 'REJECTED')) lines.push(e(`    📝 ${r.review_note}`));
    }
    lines.push('');
  }
  lines.push(e('ለፋይናንስ አዲስ የገንዘብ ጥያቄ ለማቅረብ «➕ አዲስ ጥያቄ» ይጫኑ። · Tap “➕ New request” to ask Finance for money.'));
  await save(db, chatId, 'BUDGET_MENU', { units });
  return sendTelegram(chatId, lines.join('\n'), keyboard([[NEW], [CANCEL]]));
}

function askCategory(db: SupabaseClient, chatId: number, data: BudgetData) {
  return save(db, chatId, 'BUDGET_CATEGORY', data).then(() =>
    sendTelegram(
      chatId,
      e(`🏢 ${data.unit!.name_am}\nገንዘቡ ለምንድን ነው? · What is the money for?`),
      keyboard([...pairs(EXPENSE_CATEGORIES.map(categoryButton)), [CANCEL]])
    )
  );
}

function summary(d: BudgetData): string {
  const priority = PRIORITIES.find(([, code]) => code === d.priority)?.[0] ?? '';
  return [
    '📋 <b>ጥያቄዎ · Your request</b>',
    e(`🏢 ${d.unit!.name_am}`),
    e(`📂 ${categoryButton(EXPENSE_CATEGORIES.find(([en]) => en === d.category) ?? [d.category!, d.category!])}`),
    `📝 <b>${e(d.title!)}</b>`,
    `💵 <b>${e(formatETB(d.amount!))}</b>`,
    e(`💬 ${d.justification}`),
    e(`⚡ ${priority}`),
  ].join('\n');
}

export async function continueBudget(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: BudgetData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }
  const units = data.units ?? [];

  switch (step as Step) {
    case 'BUDGET_MENU': {
      if (text !== NEW) return sendTelegram(chatId, e('«➕ አዲስ ጥያቄ» ይጫኑ ወይም ይሰርዙ። · Tap “➕ New request” or cancel.'));
      if (units.length > 1) {
        await save(db, chatId, 'BUDGET_UNIT', { units });
        return sendTelegram(chatId, e('ለየትኛው ክፍል? · For which unit?'), keyboard([...units.map((u) => [unitButton(u)]), [CANCEL]]));
      }
      return askCategory(db, chatId, { units, unit: units[0] });
    }
    case 'BUDGET_UNIT': {
      const unit = units.find((u) => unitButton(u) === text);
      if (!unit) return sendTelegram(chatId, e('ከአዝራሮቹ ክፍል ይምረጡ። · Choose a unit from the buttons.'));
      return askCategory(db, chatId, { ...data, unit });
    }
    case 'BUDGET_CATEGORY': {
      const cat = EXPENSE_CATEGORIES.find((c) => categoryButton(c) === text);
      if (!cat) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
      await save(db, chatId, 'BUDGET_TITLE', { ...data, category: cat[0] });
      return sendTelegram(chatId, e('አጭር ርዕስ ይጻፉ (ለምሳሌ፦ ለ5ኛ ክፍል ፈተና ወረቀት)። · Write a short title (e.g. Paper for the grade 5 exams).'), keyboard([[CANCEL]]));
    }
    case 'BUDGET_TITLE': {
      const title = text.trim();
      if (title.length < 3 || title.length > 120) return sendTelegram(chatId, e('ርዕሱ ከ3 እስከ 120 ፊደል ይሁን። · The title should be 3 to 120 characters.'));
      await save(db, chatId, 'BUDGET_AMOUNT', { ...data, title });
      return sendTelegram(chatId, e('ስንት ብር? (ቁጥር ብቻ፣ ለምሳሌ 2500) · How much, in birr? (a number, e.g. 2500)'), keyboard([[CANCEL]]));
    }
    case 'BUDGET_AMOUNT': {
      const amount = Number(text.replace(/[,\s]|ብር|birr|etb/gi, ''));
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return sendTelegram(chatId, e('ትክክለኛ መጠን ይጻፉ (ለምሳሌ 2500)። · Write a valid amount (e.g. 2500).'));
      const rounded = Math.round(amount * 100) / 100;
      await save(db, chatId, 'BUDGET_REASON', { ...data, amount: rounded });
      const lines: string[] = [];
      // The unit's budget for the current year, when one is set (migration 009)
      try {
        const year = (await loadYears(db)).find((y) => y.is_current);
        const line = year ? (await computeBudget(db, year, [data.unit!.unit_id]))[0] : undefined;
        const left = line ? budgetRemaining(line) : null;
        if (line && left != null) {
          lines.push(e(`📊 የ${year!.name} በጀት ቀሪ · Budget left for ${year!.name}: ${formatETB(left)}`));
          if (rounded > left) lines.push(e('⚠️ ጥያቄው ከቀሪው በጀት ይበልጣል — ፋይናንስ ይህን ያያል። · This is more than the budget left — Finance will see that.'));
          lines.push('');
        }
      } catch {
        // no budget set up: nothing to show
      }
      lines.push(e('ገንዘቡ ለምን እንደሚያስፈልግ በአጭሩ ያብራሩ። · Explain briefly why the money is needed.'));
      return sendTelegram(chatId, lines.join('\n'), keyboard([[CANCEL]]));
    }
    case 'BUDGET_REASON': {
      const justification = text.trim();
      if (justification.length < 5) return sendTelegram(chatId, e('ትንሽ ተጨማሪ ያብራሩ። · Please explain a little more.'));
      await save(db, chatId, 'BUDGET_PRIORITY', { ...data, justification: justification.slice(0, 2000) });
      return sendTelegram(chatId, e('ምን ያህል አስቸኳይ ነው? · How urgent is it?'), keyboard([...pairs(PRIORITIES.map(([b]) => b)), [CANCEL]]));
    }
    case 'BUDGET_PRIORITY': {
      const priority = PRIORITIES.find(([b]) => b === text)?.[1];
      if (!priority) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
      const next = { ...data, priority };
      await save(db, chatId, 'BUDGET_CONFIRM', next);
      return sendTelegram(chatId, `${summary(next)}\n\n${e('ለፋይናንስ ይላክ? · Send it to Finance?')}`, keyboard([[SEND], [CANCEL]]));
    }
    case 'BUDGET_CONFIRM': {
      if (text !== SEND) return sendTelegram(chatId, e('«✅ ላክ» ወይም «❌ ሰርዝ» ይጫኑ። · Tap “Send” or “Cancel”.'));
      await clearSession(db, chatId);
      // Still the head, and still allowed to request?
      const still = (await requestableUnits(db, scope)).find((u) => u.unit_id === data.unit?.unit_id);
      if (!still) return sendTelegram(chatId, e('የዚህ ክፍል ኃላፊ አይደሉም — ጥያቄው አልተላከም። · You no longer head this unit — the request was not sent.'), menu);
      const { data: row, error } = await db.from('finance_requests')
        .insert({
          organization_unit_id: still.unit_id,
          requested_by: still.user_id,
          title: data.title,
          category: data.category,
          amount: data.amount,
          justification: data.justification,
          priority: data.priority ?? 'NORMAL',
          status: 'PENDING',
        })
        .select('request_no')
        .single();
      if (error || !row) return sendTelegram(chatId, e('ይቅርታ፣ ጥያቄው አልተላከም። ትንሽ ቆይተው ይሞክሩ። · Sorry, the request was not sent. Please try again later.'), menu);
      const no = (row as { request_no: string }).request_no;
      notifyLater(
        { permissions: ['FINANCE_APPROVE'], except: still.user_id },
        { title: 'አዲስ የክፍያ ጥያቄ · New payment request', body: `${no} — ${data.title} — ${formatETB(data.amount!)} (${still.name_en}, Telegram)`, url: '/dashboard/finance/requests', tag: 'finance-to-approve' }
      );
      return sendTelegram(
        chatId,
        `✅ <b>${e(no)}</b> ${e('ለፋይናንስ ተልኳል። ሲጸድቅ ወይም ሲመለስ እዚህ ይነገርዎታል። · was sent to Finance. You will be told here when it is approved or returned.')}\n${e(`${siteUrl()}/dashboard/finance/requests`)}`,
        menu
      );
    }
  }
  await clearSession(db, chatId);
  return sendTelegram(chatId, e('እንደገና ይጀምሩ። · Please start again.'), menu);
}
