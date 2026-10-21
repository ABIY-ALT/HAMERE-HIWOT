'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, ExternalLink, Globe, Image as ImageIcon, Info, Mail, Newspaper, ShieldCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import type { PermissionCode } from '@/types';
import { loadWebsiteOverview, type WebsiteOverview } from './actions';

/**
 * Public website → Overview: everything the public website shows, and where
 * each part is controlled. Nothing made elsewhere in the system is public
 * until it is added here.
 */
export default function WebsiteOverviewPage() {
  const { t } = useLang();
  const { canAny } = useAuth();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<WebsiteOverview | null>(null);

  useEffect(() => {
    loadWebsiteOverview().then((res) => {
      if (res.mode === 'live') setData(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);

  const can = (code: PermissionCode) => canAny([code]);
  const base = data?.base ?? '';
  const notSetUp = t('Not set up yet (database migration needed)', 'ገና አልተዘጋጀም (የዳታቤዝ ማሻሻያ ያስፈልጋል)');

  const parts: Part[] = [
    {
      icon: Calendar,
      title: t('Events', 'መርሐ ግብሮች'),
      page: '/events',
      status: !data ? '' : data.events ? `${data.events.shown} ${t('on the website', 'በድረ-ገጹ ላይ')} · ${data.events.waiting} ${t('coming programs not added', 'ያልተጨመሩ የሚመጡ ፕሮግራሞች')}` : notSetUp,
      note: t('Programs are internal until you add them here.', 'ፕሮግራሞች እዚህ እስኪጨመሩ ድረስ የውስጥ ናቸው።'),
      manage: { href: '/dashboard/website/events', label: t('Choose events', 'መርሐ ግብሮችን ምረጥ') },
    },
    {
      icon: Newspaper,
      title: t('News & announcements', 'ዜናና ማስታወቂያ'),
      page: '/news',
      status: !data ? '' : data.news ? `${data.news.published} ${t('published', 'የታተሙ')} · ${data.news.drafts} ${t('drafts', 'ረቂቆች')}` : notSetUp,
      note: t('A post is a draft until you publish it.', 'ጽሑፍ እስኪታተም ድረስ ረቂቅ ነው።'),
      manage: { href: '/dashboard/website/news', label: t('Manage news', 'ዜና አስተዳድር') },
    },
    {
      icon: ImageIcon,
      title: t('Photo gallery', 'የፎቶ ማዕከል'),
      page: '/gallery',
      status: !data ? '' : data.albums ? `${data.albums.shown} ${t('albums shown', 'የሚታዩ አልበሞች')} · ${data.albums.hidden} ${t('hidden', 'የተደበቁ')}` : notSetUp,
      note: t('An album is hidden until you show it.', 'አልበም እስኪገለጥ ድረስ የተደበቀ ነው።'),
      manage: { href: '/dashboard/website/gallery', label: t('Manage gallery', 'ማዕከሉን አስተዳድር') },
    },
    {
      icon: Info,
      title: t('About us', 'ስለ እኛ'),
      page: '/about',
      status: !data ? '' : `${data.aboutTopics} ${t('topics', 'ርዕሶች')} · ${data.profileSaved ? t('parish profile saved', 'የደብሩ መረጃ ተቀምጧል') : t('parish profile not written yet', 'የደብሩ መረጃ ገና አልተጻፈም')}`,
      note: t('The same About topics as the Telegram bot, and the parish profile from System Settings.', 'በቴሌግራም ቦቱ ያሉት «ስለ እኛ» ርዕሶችና ከስርዓት ቅንብሮች የደብሩ መረጃ።'),
      manage: can('SYSTEM_CONFIGURE') ? { href: '/dashboard/admin/telegram', label: t('Edit About topics', '«ስለ እኛ» አስተካክል') } : null,
      extra: can('SYSTEM_CONFIGURE') ? { href: '/dashboard/admin/settings', label: t('Parish profile', 'የደብሩ መረጃ') } : null,
    },
    {
      icon: Mail,
      title: t('Contact', 'አግኙን'),
      page: '/contact',
      status: !data ? '' : `${data.departments} ${t('departments people can write to', 'ሰዎች ሊጽፉላቸው የሚችሉ ክፍሎች')}`,
      note: t('Messages go to the department under Members’ questions, like “Ask a department” in the bot.', 'መልእክቶቹ እንደ ቦቱ «ክፍልን ጠይቅ» ለክፍሉ በ«የአባላት ጥያቄዎች» ስር ይደርሳሉ።'),
      manage: null,
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Globe size={22} /> {t('Public website', 'የሕዝብ ድረ-ገጽ')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('What anyone on the internet can see, and where each part is controlled.', 'ማንኛውም ሰው በኢንተርኔት የሚያየው፣ እና እያንዳንዱ ክፍል የሚቆጣጠርበት ቦታ።')}</p>
        </div>
        {mode === 'live' && (
          <a href={base || '/'} target="_blank" rel="noopener noreferrer" className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start">
            <ExternalLink size={14} /> {t('Open the website', 'ድረ-ገጹን ክፈት')}
          </a>
        )}
      </div>
      <AdminModeNotice mode={mode} error={error} />

      <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-start gap-3 text-sm text-emerald-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <span>
          {t(
            'Nothing in the system is public by itself. Programs, posts and albums stay internal until they are added or published from these pages. People, students, finance and other records are never shown.',
            'በስርዓቱ ውስጥ ያለ ምንም ነገር በራሱ ይፋ አይሆንም። ፕሮግራሞች፣ ጽሑፎችና አልበሞች ከእነዚህ ገጾች እስኪጨመሩ ወይም እስኪታተሙ ድረስ የውስጥ ናቸው። የሰዎች፣ የተማሪዎች፣ የገንዘብና ሌሎች መረጃዎች በፍጹም አይታዩም።'
          )}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {parts.map((p) => (
          <div key={p.page} className="card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><p.icon size={18} /></span>
                <h2 className="font-bold text-slate-900">{p.title}</h2>
              </div>
              {mode === 'live' && (
                <a href={`${base}${p.page}`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 shrink-0">
                  <ExternalLink size={12} /> {t('View', 'ይመልከቱ')}
                </a>
              )}
            </div>
            {p.status && <p className="text-sm font-semibold text-slate-700">{p.status}</p>}
            <p className="text-xs text-slate-500 flex-1">{p.note}</p>
            {(p.manage || p.extra) && (
              <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 text-xs font-semibold">
                {[p.manage, p.extra].filter((l): l is PartLink => Boolean(l)).map((l) => (
                  <Link key={l.href} href={l.href} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                    {l.label} <ArrowRight size={12} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PartLink {
  href: string;
  label: string;
}

interface Part {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  /** Path on the public website */
  page: string;
  status: string;
  note: string;
  manage: PartLink | null;
  extra?: PartLink | null;
}
