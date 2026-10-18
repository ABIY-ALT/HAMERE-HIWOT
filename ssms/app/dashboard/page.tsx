import { redirect } from 'next/navigation';
import DashboardPage from '@/components/dashboard/DashboardPage';
import { getCurrentUser } from '@/lib/auth/session';

export default async function Page() {
  // Student and parent accounts (only a portal permission) have their own home
  const me = await getCurrentUser();
  const only = (code: string) => me !== null && me.permissions.length > 0 && me.permissions.every((p) => p === code);
  if (only('STUDENT_PORTAL')) redirect('/dashboard/my');
  if (only('PARENT_PORTAL')) redirect('/dashboard/family');
  return <DashboardPage />;
}
