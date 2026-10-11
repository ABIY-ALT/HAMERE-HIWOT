import { redirect } from 'next/navigation';
import DashboardPage from '@/components/dashboard/DashboardPage';
import { getCurrentUser } from '@/lib/auth/session';

export default async function Page() {
  // A student account (only the student portal permission) has its own home
  const me = await getCurrentUser();
  if (me && me.permissions.length > 0 && me.permissions.every((p) => p === 'STUDENT_PORTAL')) redirect('/dashboard/my');
  return <DashboardPage />;
}
