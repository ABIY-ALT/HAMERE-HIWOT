'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Calendar,
  AlertCircle,
  CheckCircle,
  Check,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import type { Locale } from '@/types';
import { signOut } from '@/app/login/actions';
import { loadNotifications, type Notice } from '@/app/dashboard/actions';
import { forgetThisDevice } from '@/components/pwa/NotificationPrompt';
import { resetEducation } from '@/lib/education/client';
import { resetFinance } from '@/lib/finance/client';
import { resetProperty } from '@/lib/property/client';
import { resetChoir } from '@/lib/choir/client';
import { resetHr } from '@/lib/hr/client';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
  breadcrumbs?: { label: string; href?: string }[];
}

const DEMO_NOTICES: Notice[] = [
  { id: 'demo-1', version: '1', kind: 'alert', href: '/dashboard/finance/requests', at: null, en: '2 payment requests are waiting for your approval', am: '2 የክፍያ ጥያቄዎች የእርስዎን ማጽደቅ ይጠብቃሉ' },
  { id: 'demo-2', version: '1', kind: 'info', href: '/dashboard/hr/attendance', at: null, en: "Take today's servant attendance", am: 'የዛሬውን የአገልጋዮች ተገኝነት ይያዙ' },
  { id: 'demo-3', version: '1', kind: 'success', href: '/dashboard/finance/requests', at: null, en: 'Your request FR-2026-0003 was approved', am: 'ጥያቄዎ FR-2026-0003 ጸድቋል' },
];

// Which notices this device has seen, per user: { id: version }
const SEEN_KEY = 'ssms_notices_seen';
function readSeen(uid: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`${SEEN_KEY}:${uid}`) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function writeSeen(uid: string, seen: Record<string, string>) {
  try {
    localStorage.setItem(`${SEEN_KEY}:${uid}`, JSON.stringify(seen));
  } catch {
    // storage unavailable — read state just won't persist
  }
}

export default function Header({
  onToggleMobileSidebar,
  breadcrumbs,
}: HeaderProps) {
  const { user, logout, can } = useAuth();
  const { locale, setLocale, t } = useLang();
  const router = useRouter();

  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [seen, setSeen] = React.useState<Record<string, string>>({});
  const loadedAt = React.useRef(0);
  const uid = user?.systemUser.id ?? 'anonymous';

  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const notifRef = React.useRef<HTMLDivElement>(null);

  const refreshNotices = React.useCallback(() => {
    loadedAt.current = Date.now();
    return loadNotifications()
      .then((res) => {
        setSeen(readSeen(uid));
        setNotices(res.mode === 'live' ? res.data : res.mode === 'demo' ? DEMO_NOTICES : []);
      })
      .catch(() => {
        // offline — keep what is shown
      });
  }, [uid]);

  // Load now and every five minutes
  React.useEffect(() => {
    void refreshNotices();
    const timer = setInterval(() => void refreshNotices(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [refreshNotices]);

  // Close menus on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isUnread = (n: Notice) => seen[n.id] !== n.version;
  const unreadCount = notices.filter(isUnread).length;

  const markSeen = (list: Notice[]) => {
    const next = { ...seen };
    for (const n of list) next[n.id] = n.version;
    // Keep only notices that still exist
    const kept = Object.fromEntries(Object.entries(next).filter(([id]) => notices.some((n) => n.id === id)));
    setSeen(kept);
    writeSeen(uid, kept);
  };

  const handleLogout = async () => {
    await forgetThisDevice();
    await signOut();
    resetEducation();
    resetFinance();
    resetProperty();
    resetChoir();
    resetHr();
    logout();
    router.push('/login');
    router.refresh();
  };

  const toggleLang = () => {
    const next: Locale = locale === 'en' ? 'am' : 'en';
    setLocale(next);
  };

  return (
    <header className="header">
      {/* Mobile menu toggle (desktop uses the sidebar's own collapse button) */}
      <div className="md:hidden">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onToggleMobileSidebar}
          title={t('Open menu', 'ምናሌ ክፈት')}
          aria-label={t('Open menu', 'ምናሌ ክፈት')}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="breadcrumb hidden sm:flex flex-1">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-slate-300">/</span>}
              {crumb.href ? (
                <Link href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span className="text-slate-600 font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      {/* Language Toggle */}
      <button
        onClick={toggleLang}
        className={cn(
          'btn btn-secondary btn-sm font-semibold tracking-wide text-xs',
          'border border-slate-200 hover:border-primary'
        )}
        title={locale === 'en' ? 'Switch to Amharic' : 'Switch to English'}
      >
        {locale === 'en' ? '🇪🇹 አማ' : '🌐 EN'}
      </button>

      {/* Notifications Dropdown */}
      <div className="relative" ref={notifRef}>
        <button
          className="btn btn-ghost btn-sm relative"
          onClick={() => {
            if (!notifOpen && Date.now() - loadedAt.current > 60_000) void refreshNotices();
            setNotifOpen((o) => !o);
            setUserMenuOpen(false);
          }}
          title={t('Notifications', 'ማሳወቂያዎች')}
        >
          <Bell size={18} />
          {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-800">
                  {t('Notifications', 'ማሳወቂያዎች')}
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} {t('new', 'አዲስ')}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => markSeen(notices)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                >
                  <Check size={12} />
                  {t('Mark all read', 'ሁሉንም እንደተነበበ')}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {notices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  {t('Nothing needs your attention right now', 'አሁን ትኩረትዎን የሚሻ ነገር የለም')}
                </div>
              ) : (
                notices.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => {
                      markSeen([n]);
                      setNotifOpen(false);
                    }}
                    className={cn(
                      'p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors block text-left',
                      isUnread(n) && 'bg-blue-50/40'
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        n.kind === 'alert' && 'bg-amber-100 text-amber-700',
                        n.kind === 'success' && 'bg-emerald-100 text-emerald-700',
                        n.kind === 'info' && 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {n.kind === 'alert' && <AlertCircle size={14} />}
                      {n.kind === 'success' && <CheckCircle size={14} />}
                      {n.kind === 'info' && <Calendar size={14} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs text-slate-800 leading-snug', isUnread(n) && 'font-semibold')}>
                        {locale === 'am' ? n.am : n.en}
                      </p>
                      {n.at && (
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {formatEthiopianDate(n.at.slice(0, 10), locale)}
                        </span>
                      )}
                    </div>

                    {isUnread(n) && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />
                    )}
                  </Link>
                ))
              )}
            </div>

            {can('AUDIT_VIEW_ALL') && (
              <div className="p-2.5 border-t border-slate-100 bg-slate-50/50 text-center">
                <Link
                  href="/dashboard/audit"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                >
                  {t('View Full System Audit Trail →', 'ሁሉንም የስርዓት ኦዲት ታሪክ እይ →')}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Menu */}
      <div className="relative" ref={userMenuRef}>
        <button
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          onClick={() => {
            setUserMenuOpen((o) => !o);
            setNotifOpen(false);
          }}
        >
          <div className="avatar">
            {user ? getInitials(user.person.full_name_en) : '…'}
          </div>
          <div className="hidden sm:block text-left min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">
              {user?.person.full_name_en ?? ''}
            </div>
            <div className="text-xs text-slate-400 truncate max-w-[120px]">
              {user?.systemUser.username ?? ''}
            </div>
          </div>
          <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        </button>

        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-800">
                {user?.person.full_name_en ?? ''}
              </div>
              {user?.person.full_name_am && (
                <div className="text-xs text-slate-400 mt-0.5">{user.person.full_name_am}</div>
              )}
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                {user?.person.membership_code ?? ''}
              </div>
            </div>
            <Link
              href="/dashboard/profile"
              onClick={() => setUserMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <User size={15} className="text-slate-500" />
              {t('My Profile', 'የእኔ መገለጫ')}
            </Link>
            {can('SYSTEM_CONFIGURE') && (
              <Link
                href="/dashboard/admin/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Settings size={15} className="text-slate-500" />
                {t('System settings', 'የስርዓት ቅንብሮች')}
              </Link>
            )}
            <div className="border-t border-slate-100 mt-1" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
            >
              <LogOut size={15} />
              {t('Sign Out', 'ውጣ')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
