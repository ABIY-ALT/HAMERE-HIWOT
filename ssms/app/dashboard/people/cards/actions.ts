'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Member ID cards: the people to print cards for — members (MEMBER_VIEW),
// students by class (STUDENT_VIEW) or servants by department (HR_VIEW).
// The card's QR code is the person's member code, which check-in and the
// library find people by.
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { nonMemberIds } from '@/lib/members/membership';

export type CardGroup = 'members' | 'students' | 'servants';

export interface CardPerson {
  id: string;
  name_en: string;
  name_am: string;
  christian_name: string;
  /** What the QR code holds */
  code: string;
  /** Student registration number, when a student */
  reg_no: string;
  /** "Member" / class name / role in the department */
  role_en: string;
  role_am: string;
  has_photo: boolean;
}

export interface CardsData {
  school: [string, string];
  /** e.g. the academic year the card is valid for */
  valid: string;
  groups: CardGroup[];
  classes: { id: string; name_en: string; name_am: string }[];
  units: { id: string; name_en: string; name_am: string }[];
  people: CardPerson[];
}

type P = { id: string; full_name_en: string; full_name_am: string | null; baptismal_name: string | null; membership_code: string; profile_photo_url: string | null; status: string };
const COLS = 'id, full_name_en, full_name_am, baptismal_name, membership_code, profile_photo_url, status';

function card(p: P, role_en: string, role_am: string, reg_no = ''): CardPerson {
  return {
    id: p.id,
    name_en: p.full_name_en,
    name_am: p.full_name_am || p.full_name_en,
    christian_name: p.baptismal_name ?? '',
    code: p.membership_code,
    reg_no,
    role_en,
    role_am,
    has_photo: Boolean(p.profile_photo_url),
  };
}

export async function loadCards(params: { group?: CardGroup; classId?: string; unitId?: string } = {}): Promise<Loaded<CardsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('MEMBER_VIEW', 'STUDENT_VIEW', 'HR_VIEW');
    const can = (p: string) => me.permissions.includes(p as never);
    const groups = ([['members', 'MEMBER_VIEW'], ['students', 'STUDENT_VIEW'], ['servants', 'HR_VIEW']] as [CardGroup, string][])
      .filter(([, perm]) => can(perm))
      .map(([g]) => g);
    const group = params.group && groups.includes(params.group) ? params.group : groups[0];

    const [year, units] = await Promise.all([
      db.from('academic_years').select('id, name').eq('is_current', true).maybeSingle().then(check) as Promise<{ id: string; name: string } | null>,
      db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check) as Promise<{ id: string; name_en: string; name_am: string | null }[]>,
    ]);
    const classes = year
      ? ((await db.from('classes').select('id, name_en, name_am').eq('academic_year_id', year.id).order('grade_level').order('name_en').then(check)) as {
          id: string; name_en: string; name_am: string | null;
        }[])
      : [];

    let people: CardPerson[] = [];
    if (group === 'members') {
      const [rows, notMembers] = await Promise.all([
        selectAll<P>((a, b) => db.from('persons').select(COLS).eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)),
        nonMemberIds(db),
      ]);
      people = rows.filter((p) => !notMembers.has(p.id)).map((p) => card(p, 'Member', 'አባል'));
    } else if (group === 'students' && year) {
      const rows = (await selectAll<Record<string, unknown>>((a, b) => {
        let q = db.from('enrollments')
          .select(`class_id, class:classes(name_en, name_am), student:students!inner(reg_no, status, person:persons!students_person_id_fkey(${COLS}))`)
          .eq('academic_year_id', year.id)
          .eq('status', 'ACTIVE')
          .eq('student.status', 'ACTIVE');
        if (params.classId) q = q.eq('class_id', params.classId);
        return q.order('id').range(a, b);
      })) as unknown as { class: { name_en: string; name_am: string | null } | null; student: { reg_no: string; person: P | null } }[];
      people = rows
        .filter((r) => r.student.person)
        .map((r) => card(r.student.person!, r.class?.name_en ?? 'Student', r.class?.name_am || r.class?.name_en || 'ተማሪ', r.student.reg_no))
        .sort((x, y) => x.name_en.localeCompare(y.name_en));
    } else if (group === 'servants') {
      const ROLE: Record<string, [string, string]> = {
        HEAD: ['Head', 'ኃላፊ'], DEPUTY: ['Deputy head', 'ምክትል ኃላፊ'], SECRETARY: ['Secretary', 'ጸሐፊ'], TEACHER: ['Teacher', 'መምህር'], SERVANT: ['Servant', 'አገልጋይ'],
      };
      const rows = (await selectAll<Record<string, unknown>>((a, b) => {
        let q = db.from('service_assignments')
          .select(`role_kind, title, unit:organization_units(name_en, name_am), person:persons!service_assignments_person_id_fkey(${COLS})`)
          .eq('status', 'ACTIVE');
        if (params.unitId) q = q.eq('unit_id', params.unitId);
        return q.order('id').range(a, b);
      })) as unknown as { role_kind: string; title: string | null; unit: { name_en: string; name_am: string | null } | null; person: P | null }[];
      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.person || seen.has(r.person.id)) continue;
        seen.add(r.person.id);
        const [en, am] = ROLE[r.role_kind] ?? ['Servant', 'አገልጋይ'];
        people.push(card(r.person, `${r.title || en} — ${r.unit?.name_en ?? ''}`, `${r.title || am} — ${r.unit?.name_am || r.unit?.name_en || ''}`));
      }
      people.sort((x, y) => x.name_en.localeCompare(y.name_en));
    }

    return {
      mode: 'live',
      data: {
        school: me.tenant.is_default ? ['Hamere Hiwot Sunday School', 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት'] : [me.tenant.name_en, me.tenant.name_am || me.tenant.name_en],
        valid: year?.name ?? '',
        groups,
        classes: classes.map((c) => ({ id: c.id, name_en: c.name_en, name_am: c.name_am || c.name_en })),
        units: units.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am || u.name_en })),
        people,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
