// Platform settings: trial and grace periods, what happens when a payment is
// missed, sign-ups, how Sunday schools pay (bank / mobile-money accounts),
// and which modules are offered at all.

import { platformSettings } from '@/lib/platform/data';
import { SettingsForm } from '@/components/platform/SettingsForm';

export default async function SettingsPage() {
  const settings = await platformSettings();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <SettingsForm initial={settings} />
    </div>
  );
}
