// ─────────────────────────────────────────────────────────────────────────────
// Notification settings (migration 047: system_users.notification_prefs) —
// shapes and rules, with no server code. Each person chooses, per kind of
// notice, whether it reaches their phone / computer (push) and Telegram. The
// bell inbox always keeps a copy. The kind of a notice follows the page it
// opens, unless the sender names it (PushMessage.kind).
// ─────────────────────────────────────────────────────────────────────────────

export type NoticeKind = 'approvals' | 'grades' | 'tasks' | 'questions' | 'library' | 'service' | 'other';
export type NoticeChannel = 'push' | 'telegram';

export type NotificationPrefs = Partial<Record<NoticeKind, Partial<Record<NoticeChannel, boolean>>>>;

export const NOTICE_KINDS: { kind: NoticeKind; label: [string, string]; hint: [string, string] }[] = [
  { kind: 'approvals', label: ['Finance & approvals', 'ፋይናንስና ማጽደቅ'], hint: ['Payment and budget requests, journal entries, dues reports', 'የክፍያና የበጀት ጥያቄዎች፣ የሂሳብ ምዝገባዎች፣ የመዋጮ ሪፖርቶች'] },
  { kind: 'grades', label: ['Grades & exams', 'ውጤትና ፈተና'], hint: ['Grades waiting for approval, exam results', 'ማጽደቅ የሚጠብቁ ውጤቶች፣ የፈተና ውጤቶች'] },
  { kind: 'tasks', label: ['Tasks & plans', 'ተግባርና ዕቅድ'], hint: ['Tasks given to you or your department, overdue tasks, plans', 'ለእርስዎ ወይም ለክፍልዎ የተሰጡ ተግባራት፣ ያለፉ ተግባራት፣ ዕቅዶች'] },
  { kind: 'questions', label: ['Members’ questions', 'የአባላት ጥያቄዎች'], hint: ['Questions sent to your department from the bot or the website', 'ከቦቱ ወይም ከድረ-ገጹ ለክፍልዎ የተላኩ ጥያቄዎች'] },
  { kind: 'library', label: ['Library', 'ቤተ መጻሕፍት'], hint: ['Book requests and loans', 'የመጻሕፍት ጥያቄዎችና ውሰቶች'] },
  { kind: 'service', label: ['My service & roles', 'አገልግሎቴና ሚናዎቼ'], hint: ['Service roster, appointments, roles, property in your care', 'የአገልግሎት ምደባ፣ ሹመቶች፣ ሚናዎች፣ በእጅዎ ያለ ንብረት'] },
  { kind: 'other', label: ['Everything else', 'ሌሎች ሁሉ'], hint: ['Certificates, thanks for donations, other notices', 'የምስክር ወረቀቶች፣ የስጦታ ምስጋና፣ ሌሎች ማሳወቂያዎች'] },
];

const BY_PAGE: [string, NoticeKind][] = [
  ['/dashboard/finance', 'approvals'],
  ['/dashboard/education', 'grades'],
  ['/dashboard/tasks', 'tasks'],
  ['/dashboard/my-tasks', 'tasks'],
  ['/dashboard/plans', 'tasks'],
  ['/dashboard/questions', 'questions'],
  ['/dashboard/library', 'library'],
  ['/dashboard/my-service', 'service'],
  ['/dashboard/sacred-arts', 'service'],
  ['/dashboard/hr', 'service'],
  ['/dashboard/governance', 'service'],
  ['/dashboard/property', 'service'],
];

/** The kind of a notice: the one its sender named, else by the page it opens. */
export function kindOf(message: { url: string; kind?: NoticeKind }): NoticeKind {
  if (message.kind) return message.kind;
  return BY_PAGE.find(([prefix]) => message.url === prefix || message.url.startsWith(`${prefix}/`) || message.url.startsWith(`${prefix}?`))?.[1] ?? 'other';
}

/** On unless the person turned it off. */
export function wants(prefs: NotificationPrefs | null | undefined, kind: NoticeKind, channel: NoticeChannel): boolean {
  return prefs?.[kind]?.[channel] !== false;
}

/** Keeps only known kinds and channels, with true / false values (what is saved). */
export function cleanPrefs(input: unknown): NotificationPrefs {
  const out: NotificationPrefs = {};
  if (!input || typeof input !== 'object') return out;
  for (const { kind } of NOTICE_KINDS) {
    const v = (input as Record<string, unknown>)[kind];
    if (!v || typeof v !== 'object') continue;
    const entry: Partial<Record<NoticeChannel, boolean>> = {};
    for (const channel of ['push', 'telegram'] as NoticeChannel[]) {
      const c = (v as Record<string, unknown>)[channel];
      if (c === false) entry[channel] = false;
    }
    if (Object.keys(entry).length) out[kind] = entry;
  }
  return out;
}
