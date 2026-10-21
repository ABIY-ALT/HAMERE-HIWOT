// A news post in a list (server component): picture, date, title, the start of the text.

import Image from 'next/image';
import Link from 'next/link';
import { Pin } from 'lucide-react';
import { mediaUrl, type SitePost } from '@/lib/site/media';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { hrefFor, type SiteLang } from './SiteShell';

/** The post in this language, falling back to Amharic */
export const postTitle = (p: SitePost, lang: SiteLang) => (lang === 'en' && p.title_en) || p.title_am;
export const postBody = (p: SitePost, lang: SiteLang) => (lang === 'en' && p.body_en) || p.body_am;

export function NewsCard({ post, lang, base = '' }: { post: SitePost; lang: SiteLang; base?: string }) {
  return (
    <Link href={hrefFor(`/news/${post.id}`, lang, base)} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-[#2f43c8] transition">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-[#1e2770] to-[#2f43c8]">
        {post.cover_path ? (
          <Image src={mediaUrl(post.cover_path)} alt="" fill unoptimized sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-60">📰</span>
        )}
        {post.pinned && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-[#161a4b]">
            <Pin size={11} /> {lang === 'am' ? 'ማስታወቂያ' : 'Notice'}
          </span>
        )}
      </div>
      <div className="flex-1 p-4 space-y-1.5">
        {post.published_at && <div className="text-[11px] font-semibold text-amber-700">{formatEthiopianDate(post.published_at.slice(0, 10), lang)}</div>}
        <h3 className="font-bold text-slate-900 leading-snug group-hover:text-[#2f43c8]">{postTitle(post, lang)}</h3>
        <p className="text-sm text-slate-600 line-clamp-3">{postBody(post, lang)}</p>
      </div>
    </Link>
  );
}
