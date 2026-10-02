// ─────────────────────────────────────────────────────────────────────────────
// Attendance sheet: a class roll laid out as students × session dates.
// Pure function so the layout logic can be tested without the UI.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceRate, type AttendanceSession, type AttendanceStatus, type AttendanceTotals } from './store';

export interface SheetStudent {
  id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
}

export interface SheetColumn {
  sessionId: string;
  date: string;
}

export interface SheetRow {
  student: SheetStudent;
  /** One entry per column; null when the student has no mark for that session */
  cells: (AttendanceStatus | null)[];
  totals: AttendanceTotals;
  /** null when the student has no recorded sessions */
  rate: number | null;
}

export interface AttendanceSheet {
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Totals per column, counted over the students in the sheet */
  columnTotals: AttendanceTotals[];
}

const emptyTotals = (): AttendanceTotals => ({ present: 0, absent: 0, late: 0, excused: 0 });

/**
 * @param sessions sessions of ONE class (any order)
 * @param limit    keep only the most recent N sessions; 0 or less means all
 */
export function buildAttendanceSheet(
  students: SheetStudent[],
  sessions: AttendanceSession[],
  limit = 0
): AttendanceSheet {
  // Only sessions with per-student marks can appear in a roll sheet
  const withMarks = sessions
    .filter((s) => Object.keys(s.records).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const chosen = limit > 0 ? withMarks.slice(-limit) : withMarks;

  const columns: SheetColumn[] = chosen.map((s) => ({ sessionId: s.id, date: s.date }));
  const columnTotals = chosen.map(emptyTotals);

  const rows: SheetRow[] = [...students]
    .sort((a, b) => a.name_en.localeCompare(b.name_en))
    .map((student) => {
      const totals = emptyTotals();
      const cells = chosen.map((session, col) => {
        const status = session.records[student.id] ?? null;
        if (status) {
          const key = status.toLowerCase() as keyof AttendanceTotals;
          totals[key] += 1;
          columnTotals[col][key] += 1;
        }
        return status;
      });
      const recorded = totals.present + totals.absent + totals.late + totals.excused;
      return { student, cells, totals, rate: recorded === 0 ? null : attendanceRate(totals) };
    });

  return { columns, rows, columnTotals };
}

export const STATUS_LETTER: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  EXCUSED: 'E',
};
