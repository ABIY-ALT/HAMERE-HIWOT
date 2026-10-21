import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { pinOnly } from '@/lib/auth/temp-password';
import SetPasswordForm from '@/components/auth/SetPasswordForm';

export const metadata: Metadata = {
  description: 'Choose your own PIN or password',
};

/** After signing in with a temporary PIN / password (lib/auth/temp-password). */
export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect('/dashboard');
  return (
    <SetPasswordForm
      pin={pinOnly(user.systemUser.username, user.permissions)}
      name={user.person.full_name_am || user.person.full_name_en}
      login={user.systemUser.username}
    />
  );
}
