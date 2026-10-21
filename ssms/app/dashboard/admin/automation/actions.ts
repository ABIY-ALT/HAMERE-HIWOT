'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Administration → Automation (SYSTEM_CONFIGURE): which daily jobs run, what
// the last run did, and "Run now". The jobs: lib/automation/jobs.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { env } from '@/lib/env';
import { siteUrl, telegramConfigured } from '@/lib/telegram/bot';
import { pushConfigured } from '@/lib/push/send';
import { loadAutomation, loadLastRun, runDaily } from '@/lib/automation/jobs';
import { AUTOMATION_KEY, type AutomationSettings, type LastRun } from '@/lib/automation/types';

export interface AutomationPage {
  settings: AutomationSettings;
  last_run: LastRun | null;
  /** CRON_SECRET is set, so the daily timer can call the site */
  timer_ready: boolean;
  cron_url: string;
  telegram: boolean;
  push: boolean;
}

export async function loadAutomationPage(): Promise<Loaded<AutomationPage>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('SYSTEM_CONFIGURE');
    const [settings, last_run] = await Promise.all([loadAutomation(db), loadLastRun(db)]);
    return {
      mode: 'live',
      data: {
        settings,
        last_run,
        timer_ready: Boolean(env.cronSecret()),
        cron_url: `${siteUrl()}/api/cron`,
        telegram: telegramConfigured(),
        push: pushConfigured(),
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const SettingsSchema = z.object({
  event_reminders: z.boolean(),
  roster_reminders: z.boolean(),
  vestment_reminders: z.boolean(),
  overdue_tasks: z.boolean(),
  dues_reminders: z.boolean(),
  dues_day: z.coerce.number().int().min(1, 'Choose a day from 1 to 30').max(30, 'Choose a day from 1 to 30'),
});

export async function saveAutomation(input: AutomationSettings): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    const value = SettingsSchema.parse(input);
    await db.from('system_settings')
      .upsert({ key: AUTOMATION_KEY, value, updated_by: me.systemUser.id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Runs the daily jobs now. Safe: whatever already went out today is not sent again. */
export async function runAutomationNow(): Promise<{ ok: true; run: LastRun } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('SYSTEM_CONFIGURE');
    return { ok: true, run: await runDaily(db, 'manual') };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
