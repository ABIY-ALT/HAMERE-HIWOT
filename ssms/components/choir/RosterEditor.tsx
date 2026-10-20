'use client';

// The roster of one service: every active choir member with their rehearsal
// attendance before that day; tick who serves (or "Suggest from attendance"),
// give a part, then save a draft or publish (tells everyone in the bot).

import React, { useState } from 'react';
import { AlertCircle, Megaphone, Search, Sparkles } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { VOICE_PARTS, type ChoirMember, type ChoirSession, type VoicePart } from '@/lib/choir/types';
import {
  MIN_RATE,
  RATE_CHOICES,
  RESPONSE_LABEL,
  ROLE_SUGGESTIONS,
  WEEKS,
  WEEK_CHOICES,
  rehearsalRate,
  suggestRoster,
  type Roster,
} from '@/lib/choir/service';
import { saveRoster } from '@/app/dashboard/sacred-arts/service/actions';

const VOICE_ORDER: VoicePart[] = ['SOPRANO', 'ALTO', 'TENOR', 'BASS', 'NOT_SET'];
const RESPONSE_STYLE = { PENDING: 'bg-slate-100 text-slate-600', CONFIRMED: 'bg-emerald-100 text-emerald-800', DECLINED: 'bg-red-100 text-red-700' } as const;

export function rateTone(rate: number | null, min: number) {
  if (rate === null) return { bar: 'bg-slate-200', text: 'text-slate-400' };
  if (rate >= min) return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (rate >= min - 20) return { bar: 'bg-amber-400', text: 'text-amber-700' };
  return { bar: 'bg-red-400', text: 'text-red-600' };
}

export function RosterEditor({
  session,
  roster,
  members,
  sessions,
  onClose,
  onSaved,
}: {
  session: ChoirSession;
  roster: Roster | undefined;
  members: ChoirMember[];
  sessions: ChoirSession[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { t, locale } = useLang();
  const pair = (p: [string, string]) => t(p[0], p[1]);
  const published = roster?.status === 'PUBLISHED';
  const [weeks, setWeeks] = useState(roster?.weeks ?? WEEKS);
  const [minRate, setMinRate] = useState(roster?.min_rate ?? MIN_RATE);
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries((roster?.assignments ?? []).map((a) => [a.member_id, a.role])));
  const [search, setSearch] = useState('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byAssignment = new Map((roster?.assignments ?? []).map((a) => [a.member_id, a]));
  const people = members
    .filter((m) => m.status === 'ACTIVE' || byAssignment.has(m.id))
    .map((m) => ({ m, r: rehearsalRate(sessions, m.id, session.date, weeks) }))
    .sort((a, b) => VOICE_ORDER.indexOf(a.m.voice_part) - VOICE_ORDER.indexOf(b.m.voice_part) || (b.r.rate ?? -1) - (a.r.rate ?? -1) || a.m.name.localeCompare(b.m.name));
  const held = people[0]?.r.held ?? rehearsalRate(sessions, '', session.date, weeks).held;
  const name = (m: ChoirMember) => (locale === 'am' ? m.name_am : m.name);
  const q = search.trim().toLowerCase();
  const shown = people.filter(({ m }) => (!onlyPicked || m.id in picked) && (!q || m.name.toLowerCase().includes(q) || m.name_am.includes(search.trim())));
  const count = Object.keys(picked).length;
  const perVoice = VOICE_ORDER.map((v) => [v, people.filter(({ m }) => m.voice_part === v && m.id in picked).length] as const).filter(([, n]) => n > 0);
  const meeting = people.filter(({ m, r }) => m.status === 'ACTIVE' && r.rate !== null && r.rate >= minRate).length;

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = { ...cur };
      if (id in next) delete next[id];
      else next[id] = '';
      return next;
    });
  const suggest = () => {
    const ids = suggestRoster(members, sessions, session.date, weeks, minRate);
    setPicked((cur) => Object.fromEntries(ids.map((id) => [id, cur[id] ?? byAssignment.get(id)?.role ?? ''])));
  };

  const save = async (publish: boolean) => {
    if (publish && !published) {
      const active = members.filter((m) => m.status === 'ACTIVE').length;
      const ok = window.confirm(
        t(
          `Publish this roster? All ${active} active choir members are told in the Telegram bot — the ${count} on it with their part, the others that they are not on it this time.`,
          `ምደባው ይውጣ? ${active} ንቁ የመዘምራን አባላት በቴሌግራም ቦቱ ይነገራቸዋል — የተመደቡት ${count} ከድርሻቸው ጋር፣ ሌሎቹ በዚህ ጊዜ እንዳልተመደቡ።`
        )
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    const res = await saveRoster(session.id, { weeks, min_rate: minRate, entries: Object.entries(picked).map(([member_id, role]) => ({ member_id, role })) }, publish);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved(
      publish || published
        ? t(`Saved — ${res.told ?? 0} message(s) going out in the bot`, `ተቀምጧል — ${res.told ?? 0} መልእክት በቦቱ እየተላከ ነው`)
        : t('Draft saved — nobody is told yet', 'ረቂቁ ተቀምጧል — ገና ለማንም አልተነገረም')
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${t('Roster', 'ምደባ')} — ${session.title || t('Service', 'አገልግሎት')}`}
      subtitle={`${formatEthiopianDate(session.date, locale, { weekday: true })}${session.start_time ? ` · ${session.start_time}` : ''}`}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* The rule */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span>{t('Rehearsal attendance in the last', 'ባለፉት')}</span>
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="form-input text-xs py-1 w-auto">
              {WEEK_CHOICES.map((w) => <option key={w} value={w}>{w} {t('weeks', 'ሳምንታት')}</option>)}
            </select>
            <span>{t('at least', 'ቢያንስ')}</span>
            <select value={minRate} onChange={(e) => setMinRate(Number(e.target.value))} className="form-input text-xs py-1 w-auto">
              {RATE_CHOICES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
            <button type="button" onClick={suggest} className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1 ml-auto">
              <Sparkles size={13} /> {t('Suggest from attendance', 'ከተገኝነት ጠቁም')} ({meeting})
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {held === 0
              ? t('No rehearsal attendance was taken in this period — take attendance on Rehearsals & Services (or use check-in) so the page can suggest.', 'በዚህ ጊዜ የጥናት ተገኝነት አልተያዘም — እንዲጠቁም በ«ልምምድና አገልግሎት» (ወይም በመገኘት መመዝገቢያ) ተገኝነት ይያዙ።')
              : t(`${held} rehearsal(s) held in this period. Excused rehearsals are not counted.`, `በዚህ ጊዜ ${held} ጥናት ተካሂዷል። በፈቃድ የቀሩበት አይቆጠርም።`)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Find a member…', 'አባል ፈልግ…')} className="form-input text-sm pl-8" />
          </div>
          <label className="text-xs text-slate-600 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> {t('Only the chosen', 'የተመረጡትን ብቻ')}
          </label>
          {count > 0 && <button type="button" onClick={() => setPicked({})} className="text-xs text-slate-500 hover:text-red-600">{t('Clear', 'አጽዳ')}</button>}
        </div>

        <datalist id="roster-roles">
          {ROLE_SUGGESTIONS.map(([en, am]) => <option key={en} value={locale === 'am' ? am : en} />)}
        </datalist>

        <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
          {shown.map(({ m, r }, i) => {
            const on = m.id in picked;
            const tone = rateTone(r.rate, minRate);
            const a = byAssignment.get(m.id);
            const newVoice = i === 0 || shown[i - 1].m.voice_part !== m.voice_part;
            return (
              <React.Fragment key={m.id}>
                {newVoice && <li className="px-3 py-1 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide sticky top-0">{pair(VOICE_PARTS[m.voice_part])}</li>}
                <li className={`px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 ${on ? 'bg-blue-50/50' : ''}`}>
                  <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="h-4 w-4" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">
                        {name(m)}
                        {m.status !== 'ACTIVE' && <span className="ml-1 text-[10px] text-slate-400">({t('inactive', 'ንቁ ያልሆነ')})</span>}
                      </span>
                      {a && published && (
                        <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded ${RESPONSE_STYLE[a.response]}`} title={a.response_note}>
                          {pair(RESPONSE_LABEL[a.response])}
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 sm:w-40 shrink-0" title={t(`${r.came} of ${r.counted} rehearsals`, `ከ${r.counted} ጥናት ${r.came}`)}>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${tone.bar}`} style={{ width: `${r.rate ?? 0}%` }} />
                    </div>
                    <span className={`text-xs font-semibold tabular-nums w-16 text-right ${tone.text}`}>
                      {r.rate === null ? t('no data', 'መረጃ የለም') : `${r.rate}% · ${r.came}/${r.counted}`}
                    </span>
                  </div>
                  <input
                    list="roster-roles"
                    value={picked[m.id] ?? ''}
                    disabled={!on}
                    onChange={(e) => setPicked((cur) => ({ ...cur, [m.id]: e.target.value }))}
                    placeholder={on ? t('Part (optional)', 'ድርሻ (አማራጭ)') : ''}
                    className="form-input text-xs py-1 sm:w-36 disabled:bg-slate-50 disabled:opacity-40"
                  />
                </li>
              </React.Fragment>
            );
          })}
          {shown.length === 0 && <li className="p-6 text-center text-sm text-slate-400">{t('No members match.', 'የሚዛመድ አባል የለም።')}</li>}
        </ul>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-600">
            <b className="text-slate-900">{count}</b> {t('chosen', 'ተመርጠዋል')}
            {perVoice.length > 0 && <span className="text-slate-400"> · {perVoice.map(([v, n]) => `${pair(VOICE_PARTS[v])} ${n}`).join(' · ')}</span>}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
            {!published && (
              <button type="button" disabled={busy} onClick={() => save(false)} className="btn btn-secondary text-xs disabled:opacity-60">
                {t('Save draft', 'ረቂቅ አስቀምጥ')}
              </button>
            )}
            <button type="button" disabled={busy || count === 0} onClick={() => save(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Megaphone size={14} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : published ? t('Save & tell the changes', 'አስቀምጥና ለውጡን አሳውቅ') : t('Publish & tell everyone', 'አውጣና ለሁሉም አሳውቅ')}
            </button>
          </div>
        </div>
        {published && (
          <p className="text-[11px] text-slate-400">
            {t('Already published: only people added, taken off or given another part get a message.', 'ቀድሞ ወጥቷል፦ የተጨመሩ፣ የተነሱ ወይም ድርሻቸው የተቀየረ ብቻ መልእክት ይደርሳቸዋል።')}
          </p>
        )}
      </div>
    </Modal>
  );
}
