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
  Trash2,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import type { Locale } from '@/types';
import { signOut } from '@/app/login/actions';
import { resetEducation } from '@/lib/education/client';
import { resetFinance } from '@/lib/finance/client';
import { resetProperty } from '@/lib/property/client';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
  breadcrumbs?: { label: string; href?: string }[];
}

interface NotificationItem {
  id: string;
  titleEn: string;
  titleAm: string;
  timeEn: string;
  timeAm: string;
  type: 'alert' | 'info' | 'success';
  read: boolean;
  href: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-001',
    titleEn: 'Board of Management quorum verified (9 members)',
    titleAm: 'የሥራ አመራር ጉባኤ ምልዓተ ጉባኤ ተረጋግጧል (9 አባላት)',
    timeEn: '10m ago',
    timeAm: 'ከ10 ደቂቃ በፊት',
    type: 'success',
    read: false,
    href: '/dashboard/governance/management-board',
  },
  {
    id: 'n-002',
    titleEn: 'Expense authorization pending: Youth Conference (ETB 8,000)',
    titleAm: 'የወጪ ፈቃድ ጥያቄ በጥበቃ ላይ: የወጣቶች ጉባኤ (8,000 ብር)',
    timeEn: '1h ago',
    timeAm: 'ከ1 ሰዓት በፊት',
    type: 'alert',
    read: false,
    href: '/dashboard/finance/approvals',
  },
  {
    id: 'n-003',
    titleEn: 'Grade 3 attendance session recorded by Abebe Bekele',
    titleAm: 'የክፍል 3 ክትትል በአበበ በቀለ ተመዝግቧል',
    timeEn: '3h ago',
    timeAm: 'ከ3 ሰዓት በፊት',
    type: 'info',
    read: false,
    href: '/dashboard/education/attendance',
  },
];

export default function Header({
  onToggleMobileSidebar,
  breadcrumbs,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLang();
  const router = useRouter();

  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const notifRef = React.useRef<HTMLDivElement>(null);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    setNotifications([]);
  };

  const handleLogout = async () => {
    await signOut();
    resetEducation();
    resetFinance();
    resetProperty();
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
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                  >
                    <Check size={12} />
                    {t('Mark read', 'እንደተነበበ')}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearNotifications}
                    className="text-xs text-slate-400 hover:text-red-600 font-medium p-1"
                    title={t('Clear all', 'ሁሉንም አጽዳ')}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  {t('No notifications at this time', 'ምንም ማሳወቂያዎች የሉም')}
                </div>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setNotifOpen(false)}
                    className={cn(
                      'p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors block text-left',
                      !n.read && 'bg-blue-50/40'
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        n.type === 'alert' && 'bg-amber-100 text-amber-700',
                        n.type === 'success' && 'bg-emerald-100 text-emerald-700',
                        n.type === 'info' && 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {n.type === 'alert' && <AlertCircle size={14} />}
                      {n.type === 'success' && <CheckCircle size={14} />}
                      {n.type === 'info' && <Calendar size={14} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs text-slate-800 leading-snug', !n.read && 'font-semibold')}>
                        {locale === 'am' ? n.titleAm : n.titleEn}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        {locale === 'am' ? n.timeAm : n.timeEn}
                      </span>
                    </div>

                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />
                    )}
                  </Link>
                ))
              )}
            </div>

            <div className="p-2.5 border-t border-slate-100 bg-slate-50/50 text-center">
              <Link
                href="/dashboard/audit"
                onClick={() => setNotifOpen(false)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                {t('View Full System Audit Trail →', 'ሁሉንም የስርዓት ኦዲት ታሪክ እይ →')}
              </Link>
            </div>
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
            {user ? getInitials(user.person.full_name_en) : 'YT'}
          </div>
          <div className="hidden sm:block text-left min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">
              {user?.person.full_name_en ?? 'Yohannes Tesfaye'}
            </div>
            <div className="text-xs text-slate-400 truncate max-w-[120px]">
              {user?.systemUser.username ?? 'admin'}
            </div>
          </div>
          <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        </button>

        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-800">
                {user?.person.full_name_en ?? 'Yohannes Tesfaye'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {user?.person.full_name_am ?? 'ዮሐንስ ተስፋዬ'}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                {user?.person.membership_code ?? 'MBR-2024-0005'}
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
            <Link
              href="/dashboard/admin/settings"
              onClick={() => setUserMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Settings size={15} className="text-slate-500" />
              {t('Settings', 'ቅንብሮች')}
            </Link>
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
