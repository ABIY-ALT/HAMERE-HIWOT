// ─────────────────────────────────────────────────────────────────────────────
// Year-end promotion — the suggested new class for each student. Pure
// functions (no database), shared by the promotion page and its tests.
// ─────────────────────────────────────────────────────────────────────────────

export interface LevelClass {
  id: string;
  name_en: string;
  grade_level: number;
}

/** Where a class's students go next year: up one grade, or the same grade (repeat). */
export interface ClassTargets {
  up: string | null;
  same: string | null;
}

/** For each of this year's classes: next year's class one grade up, and the one at the same grade. */
export function defaultTargets(fromClasses: LevelClass[], toClasses: LevelClass[]): Map<string, ClassTargets> {
  const sorted = [...toClasses].sort((a, b) => a.grade_level - b.grade_level || a.name_en.localeCompare(b.name_en));
  // At that grade, prefer a class with the same name (groups like "Youth" keep their name); otherwise the first one
  const pick = (level: number, name: string) => {
    const atLevel = sorted.filter((c) => c.grade_level === level);
    return (atLevel.find((c) => c.name_en.toLowerCase() === name.toLowerCase()) ?? atLevel[0])?.id ?? null;
  };
  return new Map(fromClasses.map((c) => [c.id, { up: pick(c.grade_level + 1, c.name_en), same: pick(c.grade_level, c.name_en) }]));
}

/**
 * The suggested class next year ('' = leaves / graduates):
 * already enrolled → that class; passed (or no results) → up a grade;
 * below the pass mark → the same grade. With no higher class, passing students leave.
 */
export function suggestedClass(
  student: { class_id: string; average: number | null; next_class_id: string | null },
  targets: Map<string, ClassTargets>,
  passMark: number
): string {
  if (student.next_class_id) return student.next_class_id;
  const t = targets.get(student.class_id) ?? { up: null, same: null };
  if (student.average === null || student.average >= passMark) return t.up ?? '';
  return t.same ?? t.up ?? '';
}
