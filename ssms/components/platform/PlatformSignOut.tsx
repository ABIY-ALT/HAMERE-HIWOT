'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from '@/app/login/actions';

export function PlatformSignOut() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push('/login');
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/25 hover:bg-white/10"
    >
      <LogOut size={14} /> Sign out
    </button>
  );
}
